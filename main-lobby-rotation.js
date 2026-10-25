// ========================================
// YP-Manager メインロビー自動補充・試合ローテーション
// ========================================
// script.js / rooms.js / main-lobby-settings.js の後に読み込む。
// 古い auto-lobby.js は併用しない。
//
// 通常：2試合で交代
// 観戦経験あり：3試合で交代
//
// 「今の試合終了＋1」:
// 1. 今回の待機列を保存
// 2. 参加中の人の試合数を＋1
// 3. 規定試合数に達した人を再参加待機の最後尾へ
// 4. 前回観戦していた人を参加状態に戻す
// 5. その上にいた人を観戦状態にする
// 6. 今回の操作前から待機していた人だけを補充する
// 7. 補充人数は今回終了した人の人数まで
// 8. 前回観戦していた人を参加中一覧の一番上にする

(function () {
    "use strict";

    if (window.__ypMainLobbyRotationStarted) return;
    window.__ypMainLobbyRotationStarted = true;

    const CAPACITY_KEY = "main_lobby_capacity";
    const HOST_NAME_KEY = "main_lobby_host_name";

    let capacity = 9;
    let capacityLoaded = false;
    let capacityReadAt = 0;
    let hostName = "";

    let autoBusy = false;
    let roundBusy = false;
    let suppressAuto = false;
    let watcherEnforceBusy = false;

    let roundButton = null;
    let dashboardObserver = null;


    // ========================================
    // 試合数の目標
    // ========================================

    function getMatchTarget(person) {
        return person?.watcher_bonus === true ? 3 : 2;
    }

    window.getMatchTarget = getMatchTarget;

    window.getMatchCount = function (person) {
        const count = Number(person?.match_count);

        if (!Number.isFinite(count)) return 0;

        return Math.max(
            0,
            Math.min(getMatchTarget(person), count)
        );
    };


    // ========================================
    // 試合数表示を2試合／3試合に切り替える
    // ========================================

    const originalUpdateMatchDisplay = window.updateMatchDisplay;

    if (typeof originalUpdateMatchDisplay === "function") {
        window.updateMatchDisplay = function (personBox, person) {
            originalUpdateMatchDisplay(personBox, person);

            const boxes = Array.from(
                personBox.querySelectorAll(".date")
            );

            const countBox = boxes.find(
                element =>
                    String(element.textContent || "")
                        .startsWith("試合数：")
            );

            if (countBox) {
                countBox.textContent =
                    `試合数：${window.getMatchCount(person)} / ${getMatchTarget(person)}`;
            }
        };
    }


    // ========================================
    // 定員取得
    // ========================================

    async function readCapacity(force = false) {
        if (
            capacityLoaded &&
            !force &&
            Date.now() - capacityReadAt < 15000
        ) {
            return capacity;
        }

        try {
            const { data, error } = await supabaseClient
                .from("app_settings")
                .select("value")
                .eq("key", CAPACITY_KEY)
                .maybeSingle();

            if (error) throw error;

            const n = Number(data?.value);

            capacity =
                Number.isInteger(n) && n >= 2 && n <= 50
                    ? n
                    : 9;

            capacityLoaded = true;
            capacityReadAt = Date.now();

        } catch (error) {
            console.error(
                "[Main Lobby] 定員読込エラー:",
                error
            );

            if (!capacityLoaded) {
                const fallback = Number(
                    typeof window.ypGetMainLobbyCapacity === "function"
                        ? window.ypGetMainLobbyCapacity()
                        : 9
                );

                capacity =
                    Number.isInteger(fallback) && fallback >= 2
                        ? fallback
                        : 9;

                capacityLoaded = true;
                capacityReadAt = Date.now();
            }
        }

        window.getRoomCapacity = () => capacity;

        return capacity;
    }


    // ========================================
    // 配信者名・参加者判定
    // ========================================

    function normalizeName(value) {
        return String(value || "")
            .normalize("NFKC")
            .trim()
            .replace(/^@+/, "")
            .replace(/[\s\u3000]+/g, "")
            .toLocaleLowerCase("ja-JP");
    }

    function isHost(person) {
        return Boolean(
            hostName &&
            normalizeName(person?.name) === normalizeName(hostName)
        );
    }

    function isChatOnly(person) {
        return typeof isChatOnlyPerson === "function"
            ? isChatOnlyPerson(person)
            : (
                person?.source === "chat" ||
                person?.chat_only === true
            );
    }

    function stateOf(person) {
        return typeof getLobbyState === "function"
            ? getLobbyState(person)
            : person?.lobby_state || person?.status || "waiting";
    }


    // ========================================
    // 順番比較
    // ========================================

    function orderCompare(a, b) {
        const aValue = a?.display_order;
        const bValue = b?.display_order;

        const aHasOrder =
            aValue !== null &&
            aValue !== undefined &&
            String(aValue).trim() !== "" &&
            Number.isFinite(Number(aValue));

        const bHasOrder =
            bValue !== null &&
            bValue !== undefined &&
            String(bValue).trim() !== "" &&
            Number.isFinite(Number(bValue));

        const x = Number(aValue);
        const y = Number(bValue);

        if (aHasOrder && bHasOrder && x !== y) return x - y;
        if (aHasOrder && !bHasOrder) return -1;
        if (!aHasOrder && bHasOrder) return 1;

        const joinedCompare =
            String(a?.joined_at || "").localeCompare(
                String(b?.joined_at || "")
            );

        if (joinedCompare !== 0) return joinedCompare;

        return String(a?.id || "").localeCompare(String(b?.id || ""));
    }


    // ========================================
    // メインロビーの参加者
    // ========================================

    function activeMembers() {
        return participants.filter(person =>
            !isChatOnly(person) &&
            !isHost(person) &&
            (
                person.status === "playing" ||
                person.status === "viewer"
            ) &&
            (
                stateOf(person) === "playing" ||
                stateOf(person) === "watching"
            )
        );
    }

    function playingMembers() {
        return activeMembers()
            .filter(person => stateOf(person) === "playing")
            .sort(orderCompare);
    }

    function watchingMembers() {
        return activeMembers()
            .filter(person => stateOf(person) === "watching")
            .sort(orderCompare);
    }


    // ========================================
    // メイン待機列
    // ========================================

    function isMainWaitingCandidate(person) {
        return (
            !isChatOnly(person) &&
            !isHost(person) &&
            person.status === "waiting" &&
            !person.room_id
        );
    }

    function mainWaitingQueue() {
        return participants
            .filter(isMainWaitingCandidate)
            .sort((a, b) => {
                const aNew =
                    a.first_participation_pending ? 0 : 1;

                const bNew =
                    b.first_participation_pending ? 0 : 1;

                if (aNew !== bNew) return aNew - bNew;

                return orderCompare(a, b);
            });
    }

    function updateLocal(id, patch) {
        participants = participants.map(person =>
            person.id === id
                ? { ...person, ...patch }
                : person
        );
    }


    // ========================================
    // 観戦ボーナスを記録
    // ========================================

    async function markWatcherBonusById(id) {
        if (!id || !currentSessionId) return;

        const person = participants.find(item => item.id === id);

        if (person?.watcher_bonus === true) return;

        const { data, error } = await supabaseClient
            .from("participants")
            .update({ watcher_bonus: true })
            .eq("id", id)
            .eq("session_id", currentSessionId)
            .select("id");

        if (error) throw error;

        if (!data?.length) {
            throw new Error(`観戦ボーナスを保存できませんでした: ${id}`);
        }

        updateLocal(id, { watcher_bonus: true });
    }

    async function markExistingWatchersAsBonus() {
        for (const watcher of watchingMembers()) {
            if (watcher.watcher_bonus !== true) {
                await markWatcherBonusById(watcher.id);
            }
        }
    }


    // ========================================
    // 既存の観戦操作を観戦ボーナスに連動
    // ========================================

    const originalSetLobbyState = window.setLobbyState;

    if (typeof originalSetLobbyState === "function") {
        window.setLobbyState = async function (id, lobbyState, status) {
            const result = await originalSetLobbyState.apply(
                this,
                arguments
            );

            if (result && lobbyState === "watching") {
                try {
                    await markWatcherBonusById(id);
                } catch (error) {
                    console.error(
                        "[Main Lobby] 観戦ボーナス保存エラー:",
                        error
                    );
                }
            }

            return result;
        };
    }

    const originalUpdateStatus = window.updateStatus;

    if (typeof originalUpdateStatus === "function") {
        window.updateStatus = async function (id, newStatus) {
            const result = await originalUpdateStatus.apply(
                this,
                arguments
            );

            if (newStatus === "viewer") {
                try {
                    await markWatcherBonusById(id);
                    await loadParticipants();
                } catch (error) {
                    console.error(
                        "[Main Lobby] 観戦ボーナス保存エラー:",
                        error
                    );
                }
            }

            return result;
        };
    }


    // ========================================
    // ロビー状態変更
    // ========================================

    async function updateState(person, nextState) {
        if (!person || !currentSessionId) {
            throw new Error("参加者または配信IDがありません。");
        }

        const patch = {
            status: "playing",
            lobby_state: nextState,
            first_participation_pending: false,
            room_id: null
        };

        if (nextState === "playing") {
            patch.playing_started_at = new Date().toISOString();
        }

        if (nextState === "watching") {
            patch.watcher_bonus = true;
        }

        const { data, error } = await supabaseClient
            .from("participants")
            .update(patch)
            .eq("id", person.id)
            .eq("session_id", currentSessionId)
            .select("id");

        if (error) throw error;

        if (!data?.length) {
            throw new Error(
                `${person.name || person.id} の状態更新に失敗しました。`
            );
        }

        updateLocal(person.id, patch);
    }


    // ========================================
    // 目標試合数に達した人を再参加待機へ
    // ========================================

    async function finishPersonAtTarget(person, target) {
        const { data, error } = await supabaseClient
            .from("participants")
            .update({
                status: "finished",
                lobby_state: "exchange",
                match_count: target,
                first_participation_pending: false,
                room_id: null
            })
            .eq("id", person.id)
            .eq("session_id", currentSessionId)
            .eq("status", "playing")
            .select("id");

        if (error) throw error;

        if (!data?.length) {
            throw new Error(
                `${person.name}さんの試合終了を記録できませんでした。`
            );
        }

        updateLocal(person.id, {
            status: "finished",
            lobby_state: "exchange",
            match_count: target,
            first_participation_pending: false,
            room_id: null
        });

        await loadParticipants();

        const latest =
            participants.find(p => p.id === person.id) || person;

        const created = await createRejoinEntry(latest);

        if (!created) {
            throw new Error(
                `${person.name}さんを再参加待機へ追加できませんでした。`
            );
        }

        await loadParticipants();

        return true;
    }


    // ========================================
    // 個人の試合終了ボタン
    // 通常2試合、観戦経験あり3試合
    // ========================================

    window.finishMatch = async function (person) {
        if (!person || !currentSessionId) return;

        try {
            const target = getMatchTarget(person);
            const currentCount = window.getMatchCount(person);
            const nextCount = Math.min(target, currentCount + 1);

            if (nextCount >= target) {
                await finishPersonAtTarget(
                    { ...person, match_count: target },
                    target
                );

                alert(
                    `${person.name}さんは${target}/${target}試合終了です。再参加待機へ移動しました。`
                );
            } else {
                const { error } = await supabaseClient
                    .from("participants")
                    .update({
                        match_count: nextCount,
                        first_participation_pending: false,
                        lobby_state: "playing",
                        status: "playing"
                    })
                    .eq("id", person.id)
                    .eq("session_id", currentSessionId)
                    .eq("status", "playing");

                if (error) throw error;

                updateLocal(person.id, {
                    match_count: nextCount,
                    first_participation_pending: false,
                    lobby_state: "playing",
                    status: "playing"
                });

                alert(
                    `${person.name}さんの試合を1試合終了として記録しました。現在 ${nextCount}/${target} 試合です。`
                );
            }

            await loadParticipants();

        } catch (error) {
            console.error("[Main Lobby] 個別試合終了エラー:", error);
            alert("試合終了を記録できませんでした。");
        }
    };


    // ========================================
    // 試合数の手動調整
    // ========================================

    window.adjustMatchCount = async function (person, delta) {
        if (!person || !currentSessionId) return;

        try {
            const target = getMatchTarget(person);
            const currentCount = window.getMatchCount(person);

            const nextCount = Math.max(
                0,
                Math.min(target, currentCount + Number(delta))
            );

            if (nextCount === currentCount) return;

            if (nextCount >= target) {
                await finishPersonAtTarget(
                    { ...person, match_count: target },
                    target
                );

                alert(
                    `${person.name}さんは${target}/${target}試合終了です。再参加待機へ移動しました。`
                );

                return;
            }

            const { error } = await supabaseClient
                .from("participants")
                .update({
                    match_count: nextCount,
                    first_participation_pending: false,
                    lobby_state: stateOf(person)
                })
                .eq("id", person.id)
                .eq("session_id", currentSessionId);

            if (error) throw error;

            updateLocal(person.id, {
                match_count: nextCount,
                first_participation_pending: false
            });

            await loadParticipants();

        } catch (error) {
            console.error("[Main Lobby] 試合数修正エラー:", error);
            alert("試合数を修正できませんでした。");
        }
    };


    // ========================================
    // 既存画面との連携
    // ========================================

    window.getRoomCapacity = () => capacity;
    window.getCurrentLobbyMembers = () => activeMembers();

    window.getNextCandidates = (limit = 3) =>
        mainWaitingQueue().slice(0, limit);


    // ========================================
    // 観戦者を一番下にする
    // 前回の並び順を利用しつつ表示順を並べ替える
    // ========================================

    async function reorderActiveDisplayOrder(topPriorityIds = []) {
        const active = activeMembers();

        if (!active.length) return;

        const prioritySet = new Set(topPriorityIds);

        const priorityMembers = topPriorityIds
            .map(id => active.find(p => p.id === id))
            .filter(p => p && stateOf(p) === "playing");

        const otherPlaying = active
            .filter(p =>
                stateOf(p) === "playing" &&
                !prioritySet.has(p.id)
            )
            .sort(orderCompare);

        const watchers = active
            .filter(p => stateOf(p) === "watching")
            .sort(orderCompare);

        const ordered = [
            ...priorityMembers,
            ...otherPlaying,
            ...watchers
        ];

        // 既存の active の display_order 値を入れ替え、
        // 新しい値との衝突をできるだけ避ける。
        const orders = active
            .map(p => p.display_order)
            .filter(value =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== "" &&
                Number.isFinite(Number(value))
            )
            .map(Number)
            .sort((a, b) => a - b);

        while (orders.length < ordered.length) {
            orders.push(
                (orders.length ? orders[orders.length - 1] : 0) + 1
            );
        }

        for (let i = 0; i < ordered.length; i++) {
            const person = ordered[i];
            const nextOrder = orders[i];

            if (Number(person.display_order) === nextOrder) {
                continue;
            }

            const { error } = await supabaseClient
                .from("participants")
                .update({ display_order: nextOrder })
                .eq("id", person.id)
                .eq("session_id", currentSessionId);

            if (error) throw error;

            updateLocal(person.id, {
                display_order: nextOrder
            });
        }
    }


    // ========================================
    // 満員時の観戦枠調整
    // 待機列の自動補充はしない
    // ========================================

    async function ensureBottomWatcher() {
        if (
            watcherEnforceBusy ||
            autoBusy ||
            roundBusy ||
            suppressAuto ||
            !currentSessionId
        ) {
            return;
        }

        watcherEnforceBusy = true;

        try {
            const cap = await readCapacity();

            await markExistingWatchersAsBonus();

            const active = activeMembers();

            if (active.length < cap || active.length === 0) {
                return;
            }

            let watchers = watchingMembers();

            // 観戦者は最大2人まで維持する。
            if (watchers.length > 2) {
                const keep = watchers.slice(-2);
                const keepIds = new Set(keep.map(p => p.id));

                for (const watcher of watchers) {
                    if (!keepIds.has(watcher.id)) {
                        await updateState(watcher, "playing");
                    }
                }

                await loadParticipants();
                watchers = watchingMembers();
            }

            if (watchers.length === 0) {
                const bottom = playingMembers().at(-1);

                if (bottom) {
                    await updateState(bottom, "watching");
                    await loadParticipants();
                }
            }

            await reorderActiveDisplayOrder();
            await loadParticipants();
            repaint();

        } catch (error) {
            console.error(
                "[Main Lobby] 観戦枠調整エラー:",
                error
            );

        } finally {
            watcherEnforceBusy = false;
        }
    }


    // ========================================
    // 手動参加開始後にも観戦枠を確認
    // ========================================

    function bindStartMatchWatcherCheck() {
        const originalStartMatch = window.startMatch;

        if (
            typeof originalStartMatch !== "function" ||
            originalStartMatch.__ypWatcherCheckBound
        ) {
            return;
        }

        const wrappedStartMatch = async function (...args) {
            const result =
                await originalStartMatch.apply(this, args);

            await ensureBottomWatcher();

            return result;
        };

        wrappedStartMatch.__ypWatcherCheckBound = true;
        window.startMatch = wrappedStartMatch;
    }


    // ========================================
    // 表示更新
    // ========================================

    function repaint() {
        if (typeof render === "function") {
            render();
        }

        updateDashboard();
    }


    // ========================================
    // 今回の操作前から待機していた人だけ補充
    //
    // limit は今回2試合／3試合で終了した人数。
    // 今回新しく作られた再参加エントリーは
    // snapshot に含まれないため同じ回では呼ばれない。
    // ========================================

    async function fillFromPreviousWaitingQueue(
        waitingSnapshotIds,
        limit
    ) {
        if (
            !Array.isArray(waitingSnapshotIds) ||
            limit <= 0
        ) {
            return 0;
        }

        let added = 0;

        const cap = await readCapacity();

        for (const id of waitingSnapshotIds) {
            if (added >= limit) break;
            if (activeMembers().length >= cap) break;

            await loadParticipants();

            const candidate = participants.find(
                person =>
                    person.id === id &&
                    isMainWaitingCandidate(person)
            );

            // すでに待機列から外れた人は飛ばす。
            if (!candidate) continue;

            const playingCount = playingMembers().length;
            const watchingCount = watchingMembers().length;

            let nextState;

            if (watchingCount > 0) {
                // 既存の観戦者数を維持しながら参加枠に入れる。
                if (playingCount < cap - watchingCount) {
                    nextState = "playing";
                } else {
                    break;
                }
            } else {
                // 観戦者がいなければ満員時の最後尾を観戦にする。
                if (playingCount < cap - 1) {
                    nextState = "playing";
                } else {
                    nextState = "watching";
                }
            }

            console.log(
                "[Main Lobby] 今回の事前待機者から補充:",
                candidate.name,
                "display_order:",
                candidate.display_order,
                "状態:",
                nextState
            );

            await updateState(candidate, nextState);
            await loadParticipants();

            added++;
        }

        return added;
    }


    // ========================================
    // 試合終了＋1・ローテーション
    //
    // 事前待機列を保存し、終了者が空けた分だけ補充。
    // 前回の観戦者（最大2人）は次の参加者一覧の先頭へ。
    // ========================================

    async function finishRoundAndRotate() {
        if (!currentSessionId || roundBusy) return;

        const currentPlayers =
            playingMembers()
                .slice()
                .sort(orderCompare);

        const oldWatchers =
            watchingMembers()
                .slice()
                .sort(orderCompare)
                .slice(-2);

        // ★操作前の待機列を保存する。
        // 今回追加される再参加者はこの配列に入らない。
        const waitingSnapshotIds =
            mainWaitingQueue().map(person => person.id);

        const cap = await readCapacity();

        if (!currentPlayers.length) {
            alert(
                "現在、試合数を進める参加中メンバーはいません。"
            );
            return;
        }

        const ok = confirm(
            `参加中の${currentPlayers.length}人の試合数を＋1します。\n` +
            "通常の人は2試合、観戦経験のある人は3試合で交代します。\n" +
            "前回観戦していた人を参加状態に戻し、その一つ上の人を観戦にします。\n" +
            "今回終了した人数分だけ、操作前から待機していた人を補充します。\n" +
            `定員：${cap}人\n\n実行しますか？`
        );

        if (!ok) return;

        roundBusy = true;
        suppressAuto = true;

        if (roundButton) {
            roundButton.disabled = true;
            roundButton.textContent = "処理中…";
        }

        const failed = [];
        let success = 0;
        let finishedCount = 0;

        try {
            // --------------------------------
            // 1. 参加中の人だけ試合数を＋1
            // --------------------------------

            for (const snapshot of currentPlayers) {
                try {
                    const person =
                        participants.find(p => p.id === snapshot.id) ||
                        snapshot;

                    const target = getMatchTarget(person);
                    const count = window.getMatchCount(person);
                    const nextCount = Math.min(target, count + 1);

                    if (nextCount <= count) continue;

                    if (nextCount >= target) {
                        // まず現在のエントリーを終了状態にする。
                        const { data, error } = await supabaseClient
                            .from("participants")
                            .update({
                                status: "finished",
                                lobby_state: "exchange",
                                match_count: target,
                                first_participation_pending: false,
                                room_id: null
                            })
                            .eq("id", person.id)
                            .eq("session_id", currentSessionId)
                            .eq("status", "playing")
                            .select("id");

                        if (error) throw error;

                        if (!data?.length) {
                            throw new Error(
                                "終了状態への更新に失敗しました。"
                            );
                        }

                        // 空いた枠の数として先に記録する。
                        finishedCount++;

                        updateLocal(person.id, {
                            status: "finished",
                            lobby_state: "exchange",
                            match_count: target,
                            first_participation_pending: false,
                            room_id: null
                        });

                        await loadParticipants();

                        const latest =
                            participants.find(p => p.id === person.id) ||
                            person;

                        // 次の再参加エントリーを作成する。
                        const created = await createRejoinEntry(latest);

                        if (!created) {
                            throw new Error(
                                "再参加待機への追加に失敗しました。"
                            );
                        }

                        await loadParticipants();

                    } else {
                        // まだ規定回数に達していなければ参加中に残す。
                        const { error } = await supabaseClient
                            .from("participants")
                            .update({
                                match_count: nextCount,
                                first_participation_pending: false,
                                lobby_state: "playing",
                                status: "playing"
                            })
                            .eq("id", person.id)
                            .eq("session_id", currentSessionId)
                            .eq("status", "playing");

                        if (error) throw error;

                        updateLocal(person.id, {
                            match_count: nextCount,
                            first_participation_pending: false,
                            lobby_state: "playing",
                            status: "playing"
                        });
                    }

                    success++;

                } catch (error) {
                    console.error(
                        "[Main Lobby] 試合数更新エラー:",
                        snapshot.name,
                        error
                    );

                    failed.push(snapshot.name || "名前不明");
                }
            }

            await loadParticipants();


            // --------------------------------
            // 2. 前回の観戦者を参加状態に戻す
            // --------------------------------

            const promotedIds = [];

            for (const oldWatcher of oldWatchers) {
                const latest = participants.find(
                    person =>
                        person.id === oldWatcher.id &&
                        isMainWaitingCandidate(person) === false &&
                        (
                            person.status === "playing" ||
                            person.status === "viewer"
                        ) &&
                        stateOf(person) === "watching"
                );

                if (!latest) continue;

                await updateState(latest, "playing");
                promotedIds.push(latest.id);

                await loadParticipants();

                console.log(
                    "[Main Lobby] 前回の観戦者を参加状態へ:",
                    latest.name
                );
            }


            // --------------------------------
            // 3. 前回観戦者以外の最後尾を観戦状態へ
            //    前回観戦していた人数と同じ枠数を交代する
            // --------------------------------

            const rotationCount = promotedIds.length;

            if (rotationCount > 0) {
                const promotedSet = new Set(promotedIds);

                const candidates = playingMembers()
                    .filter(person => !promotedSet.has(person.id))
                    .sort(orderCompare);

                const nextWatchers =
                    candidates.slice(-rotationCount);

                for (const person of nextWatchers) {
                    await updateState(person, "watching");

                    await loadParticipants();

                    console.log(
                        "[Main Lobby] 新しい観戦者:",
                        person.name
                    );
                }
            }


            // --------------------------------
            // 4. 前回待機していた人から、
            //    終了者が空けた枠の数だけ補充
            // --------------------------------

            suppressAuto = false;
            roundBusy = false;

            const added = await fillFromPreviousWaitingQueue(
                waitingSnapshotIds,
                finishedCount
            );

            await loadParticipants();


            // --------------------------------
            // 5. 前回観戦者を最上位、
            //    現在の観戦者を一番下に並べる
            // --------------------------------

            await reorderActiveDisplayOrder(promotedIds);

            await loadParticipants();
            repaint();

            let message =
                `${success}人の試合数を更新しました。\n` +
                `${finishedCount}人が規定試合数に達しました。\n` +
                `${added}人を、今回の操作前から待機していた人の中から補充しました。\n` +
                "前回観戦していた人を参加中一覧の上位に移動しました。";

            if (failed.length) {
                message +=
                    `\n\n処理できなかった参加者：\n${failed.join("、")}`;
            }

            alert(message);

        } catch (error) {
            console.error(
                "[Main Lobby] 試合終了＋1エラー:",
                error
            );

            alert(
                "試合終了後の処理に失敗しました。参加者一覧とブラウザのConsoleを確認してください。"
            );

        } finally {
            suppressAuto = false;
            roundBusy = false;

            if (roundButton) {
                roundButton.disabled = false;
                roundButton.textContent =
                    "🎮 今の試合終了（試合数＋1・自動交代）";
            }

            await loadParticipants();
            repaint();
        }
    }


    // ========================================
    // 試合終了ボタンを差し替える
    // ========================================

    function bindRoundButton() {
        const original =
            document.getElementById("bulkFinishOneMatchButton");

        if (!original) return;

        if (original.dataset.ypRotationBound === "true") {
            roundButton = original;
            return;
        }

        const replacement = original.cloneNode(true);

        replacement.id = "bulkFinishOneMatchButton";
        replacement.dataset.ypRotationBound = "true";

        replacement.textContent =
            "🎮 今の試合終了（試合数＋1・自動交代）";

        original.replaceWith(replacement);

        replacement.addEventListener(
            "click",
            finishRoundAndRotate
        );

        roundButton = replacement;
    }


    // ========================================
    // ロビー人数表示
    // ========================================

    function updateDashboard() {
        const dashboard =
            document.getElementById("lobbyDashboard");

        if (!dashboard || dashboard.children.length < 2) return;

        const active = activeMembers();

        const playing =
            active.filter(p => stateOf(p) === "playing").length;

        const watching =
            active.filter(p => stateOf(p) === "watching").length;

        const waiting =
            participants.filter(isMainWaitingCandidate).length;

        const exchange =
            participants.filter(
                p =>
                    isMainWaitingCandidate(p) &&
                    stateOf(p) === "exchange"
            ).length;

        const title =
            `🎮 メインロビー ${active.length} / ${capacity}人`;

        const stats =
            `🟢 参加中 ${playing} / ${capacity}人　` +
            `👀 観戦 ${watching}人　` +
            `🟡 待機中 ${waiting}人　` +
            `🔄 交代待ち ${exchange}人`;

        if (dashboard.children[0].textContent !== title) {
            dashboard.children[0].textContent = title;
            dashboard.children[0].style.fontWeight = "bold";
            dashboard.children[0].style.marginBottom = "8px";
        }

        if (dashboard.children[1].textContent !== stats) {
            dashboard.children[1].textContent = stats;
            dashboard.children[1].style.marginBottom = "8px";
        }
    }

    function observeDashboard() {
        const dashboard =
            document.getElementById("lobbyDashboard");

        if (!dashboard || dashboardObserver) return;

        dashboardObserver = new MutationObserver(updateDashboard);

        dashboardObserver.observe(
            dashboard,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );

        updateDashboard();
    }


    // ========================================
    // 配信者名設定
    // ========================================

    function addHostNameControl() {
        const panel =
            document.getElementById("mainLobbySettingsPanel");

        if (
            !panel ||
            document.getElementById("mainLobbyHostNameInput")
        ) {
            return;
        }

        const block = document.createElement("div");

        block.style.cssText =
            "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid #555;";

        block.innerHTML = `
            <label
                for="mainLobbyHostNameInput"
                style="font-size:13px;color:#ddd;"
            >
                配信者アカウント名（定員から除外）
            </label>

            <input
                id="mainLobbyHostNameInput"
                type="text"
                maxlength="60"
                placeholder="例：@ゆうぽんちゃんねる（任意）"
                style="flex:1;min-width:200px;padding:9px;border:0;border-radius:7px;font-size:14px;"
            >

            <button
                id="saveMainLobbyHostName"
                type="button"
                style="padding:9px 12px;border:0;border-radius:7px;background:#398bd4;color:#fff;font-weight:bold;cursor:pointer;"
            >
                配信者名を保存
            </button>

            <div
                id="mainLobbyHostNameStatus"
                style="width:100%;font-size:12px;color:#bbb;"
            >
                空欄なら名前による除外は行いません。
            </div>
        `;

        panel.appendChild(block);

        document
            .getElementById("saveMainLobbyHostName")
            .addEventListener("click", saveHostName);
    }

    async function loadHostName() {
        try {
            const { data, error } = await supabaseClient
                .from("app_settings")
                .select("value")
                .eq("key", HOST_NAME_KEY)
                .maybeSingle();

            if (error) throw error;

            hostName =
                data?.value == null
                    ? ""
                    : String(data.value).trim();

            const input =
                document.getElementById("mainLobbyHostNameInput");

            const status =
                document.getElementById("mainLobbyHostNameStatus");

            if (input) input.value = hostName;

            if (status) {
                status.textContent =
                    hostName
                        ? `配信者名「${hostName}」を定員計算から除外します。`
                        : "空欄なら名前による除外は行いません。";
            }

        } catch (error) {
            console.error(
                "[Main Lobby] 配信者名読込エラー:",
                error
            );
        }
    }

    async function saveHostName() {
        const input =
            document.getElementById("mainLobbyHostNameInput");

        const status =
            document.getElementById("mainLobbyHostNameStatus");

        const button =
            document.getElementById("saveMainLobbyHostName");

        if (!input || !button) return;

        button.disabled = true;
        button.textContent = "保存中…";

        const value = String(input.value || "").trim();

        try {
            const { error } = await supabaseClient
                .from("app_settings")
                .upsert(
                    {
                        key: HOST_NAME_KEY,
                        value,
                        updated_at: new Date().toISOString()
                    },
                    { onConflict: "key" }
                );

            if (error) throw error;

            hostName = value;

            if (status) {
                status.textContent =
                    value
                        ? `配信者名「${value}」を定員計算から除外します。`
                        : "配信者名を空欄にしました。名前による除外は行いません。";
            }

            repaint();
            await ensureBottomWatcher();

        } catch (error) {
            console.error(
                "[Main Lobby] 配信者名保存エラー:",
                error
            );

            alert(
                "配信者名を保存できませんでした。Supabaseの権限や通信を確認してください。"
            );

        } finally {
            button.disabled = false;
            button.textContent = "配信者名を保存";
        }
    }


    // ========================================
    // 定員変更
    // ========================================

    function bindCapacitySaveRefresh() {
        const button =
            document.getElementById("saveMainLobbyCapacity");

        if (
            !button ||
            button.dataset.ypCapacityRefreshBound === "true"
        ) {
            return;
        }

        button.dataset.ypCapacityRefreshBound = "true";

        button.addEventListener("click", () => {
            setTimeout(async () => {
                await readCapacity(true);

                window.getRoomCapacity = () => capacity;

                updateDashboard();
                await ensureBottomWatcher();
            }, 800);
        });
    }


    // ========================================
    // 起動
    // ========================================

    async function initialize() {
        await readCapacity(true);

        addHostNameControl();
        await loadHostName();

        bindRoundButton();
        bindStartMatchWatcherCheck();
        bindCapacitySaveRefresh();

        await loadParticipants();
        await markExistingWatchersAsBonus();
        await ensureBottomWatcher();

        observeDashboard();
        updateDashboard();
        repaint();
    }

    initialize().catch(error =>
        console.error(
            "[Main Lobby] 初期化エラー:",
            error
        )
    );


    // ========================================
    // 手動参加開始後に観戦枠を確認
    // ========================================

    function bindStartMatchWatcherCheck() {
        const originalStartMatch = window.startMatch;

        if (
            typeof originalStartMatch !== "function" ||
            originalStartMatch.__ypWatcherCheckBound
        ) {
            return;
        }

        const wrappedStartMatch = async function (...args) {
            const result =
                await originalStartMatch.apply(this, args);

            await ensureBottomWatcher();

            return result;
        };

        wrappedStartMatch.__ypWatcherCheckBound = true;
        window.startMatch = wrappedStartMatch;
    }


    // ========================================
    // 定期処理
    // 自動で空き枠を埋めない
    // ========================================

    setInterval(async () => {
        if (
            roundBusy ||
            suppressAuto ||
            autoBusy ||
            watcherEnforceBusy
        ) {
            return;
        }

        await readCapacity();

        bindRoundButton();
        bindStartMatchWatcherCheck();
        bindCapacitySaveRefresh();
        addHostNameControl();

        await markExistingWatchersAsBonus();
        await ensureBottomWatcher();

        observeDashboard();
        updateDashboard();

    }, 2500);

})();
