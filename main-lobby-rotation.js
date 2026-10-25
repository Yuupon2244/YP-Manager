// ========================================
// YP-Manager メインロビー自動補充・試合ローテーション
// ========================================
// script.js / rooms.js / main-lobby-settings.js の後に読み込む。
// 古い auto-lobby.js は併用しない。
//
// 通常の人：2試合で再参加待機へ
// 観戦経験のある人：3試合で再参加待機へ
//
// 試合終了＋1のとき：
// 1. 参加中の人の試合数を更新
// 2. 規定試合数に達した人を再参加待機へ
// 3. 旧観戦者を参加状態にする
// 4. その一つ上の参加者を観戦状態にする
// 5. 空いた枠を待機列から補充
//
// 個人／全体の強制2試合終了では自動補充しない。
// 定期処理でも空き枠を勝手に補充しない。

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


    // ========================================
    // 試合数取得を観戦ボーナス対応にする
    // ========================================

    window.getMatchCount = function (person) {
        const count = Number(person?.match_count);

        if (!Number.isFinite(count)) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(
                getMatchTarget(person),
                count
            )
        );
    };


    // ========================================
    // 試合数表示を2試合／3試合に切り替える
    // ========================================

    const originalUpdateMatchDisplay =
        window.updateMatchDisplay;

    if (typeof originalUpdateMatchDisplay === "function") {
        window.updateMatchDisplay = function (personBox, person) {
            originalUpdateMatchDisplay(personBox, person);

            const dateBoxes = Array.from(
                personBox.querySelectorAll(".date")
            );

            const countBox = dateBoxes.find(
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
                Number.isInteger(n) &&
                n >= 2 &&
                n <= 50
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
                    Number.isInteger(fallback) &&
                    fallback >= 2
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
            normalizeName(person?.name) ===
                normalizeName(hostName)
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
            : person?.lobby_state ||
              person?.status ||
              "waiting";
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

        if (aHasOrder && bHasOrder && x !== y) {
            return x - y;
        }

        if (aHasOrder && !bHasOrder) return -1;
        if (!aHasOrder && bHasOrder) return 1;

        const joinedCompare =
            String(a?.joined_at || "").localeCompare(
                String(b?.joined_at || "")
            );

        if (joinedCompare !== 0) return joinedCompare;

        return String(a?.id || "").localeCompare(
            String(b?.id || "")
        );
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

                if (aNew !== bNew) {
                    return aNew - bNew;
                }

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
    // 観戦ボーナスの保存
    // ========================================

    async function markWatcherBonusById(id) {
        if (!id || !currentSessionId) return;

        const person = participants.find(
            item => item.id === id
        );

        if (person?.watcher_bonus === true) {
            return;
        }

        const { data, error } = await supabaseClient
            .from("participants")
            .update({
                watcher_bonus: true
            })
            .eq("id", id)
            .eq("session_id", currentSessionId)
            .select("id");

        if (error) {
            throw error;
        }

        if (!data?.length) {
            throw new Error(
                `観戦ボーナスを保存できませんでした: ${id}`
            );
        }

        updateLocal(id, {
            watcher_bonus: true
        });
    }


    async function markExistingWatchersAsBonus() {
        const watchers = watchingMembers();

        for (const watcher of watchers) {
            if (watcher.watcher_bonus !== true) {
                await markWatcherBonusById(watcher.id);
            }
        }
    }


    // ========================================
    // 既存の「観戦へ」操作にもボーナスを適用
    // ========================================

    const originalSetLobbyState =
        window.setLobbyState;

    if (typeof originalSetLobbyState === "function") {
        window.setLobbyState = async function (
            id,
            lobbyState,
            status
        ) {
            const result =
                await originalSetLobbyState.apply(
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

                    alert(
                        "観戦状態には変更されましたが、3試合対象の保存に失敗しました。"
                    );
                }
            }

            return result;
        };
    }


    // ========================================
    // 別経路の「観戦」操作にもボーナスを適用
    // ========================================

    const originalUpdateStatus =
        window.updateStatus;

    if (typeof originalUpdateStatus === "function") {
        window.updateStatus = async function (id, newStatus) {
            const result =
                await originalUpdateStatus.apply(
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
            throw new Error(
                "参加者または配信IDがありません。"
            );
        }

        const patch = {
            status: "playing",
            lobby_state: nextState,
            first_participation_pending: false,
            room_id: null
        };

        if (nextState === "playing") {
            patch.playing_started_at =
                new Date().toISOString();
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
    // 再参加待機へ移動
    // 目標試合数に達した人の現行エントリーを終了
    // ========================================

    async function finishPersonAtTarget(person, target) {
        const actualCount = Math.min(
            target,
            window.getMatchCount(person)
        );

        const { data, error } = await supabaseClient
            .from("participants")
            .update({
                status: "finished",
                lobby_state: "exchange",
                match_count: actualCount,
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
            match_count: actualCount,
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
    // 個人の「試合終了」ボタンを目標試合数対応にする
    //
    // 通常：1/2 → 終了
    // 観戦経験あり：2/3 → 3/3で終了
    // ========================================

    window.finishMatch = async function (person) {
        if (!person || !currentSessionId) {
            return;
        }

        try {
            const target = getMatchTarget(person);
            const currentCount = window.getMatchCount(person);

            if (currentCount >= target) {
                await finishPersonAtTarget(person, target);

                alert(
                    `${person.name}さんは${target}/${target}試合終了です。再参加待機へ移動しました。`
                );

                return;
            }

            const nextCount = Math.min(
                target,
                currentCount + 1
            );

            if (nextCount >= target) {
                await finishPersonAtTarget(
                    {
                        ...person,
                        match_count: nextCount
                    },
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
            console.error(
                "[Main Lobby] 個別試合終了エラー:",
                error
            );

            alert(
                "試合終了を記録できませんでした。"
            );
        }
    };


    // ========================================
    // 試合数の手動調整にも2試合／3試合を適用
    // ========================================

    window.adjustMatchCount = async function (person, delta) {
        if (!person || !currentSessionId) return;

        try {
            const target = getMatchTarget(person);
            const currentCount = window.getMatchCount(person);

            const nextCount = Math.max(
                0,
                Math.min(
                    target,
                    currentCount + Number(delta)
                )
            );

            if (nextCount === currentCount) {
                return;
            }

            if (nextCount >= target) {
                await finishPersonAtTarget(
                    {
                        ...person,
                        match_count: target
                    },
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
            console.error(
                "[Main Lobby] 試合数修正エラー:",
                error
            );

            alert(
                "試合数を修正できませんでした。"
            );
        }
    };


    // ========================================
    // 既存画面との連携
    // ========================================

    window.getRoomCapacity = () => capacity;

    window.getCurrentLobbyMembers = () =>
        activeMembers();

    window.getNextCandidates = (limit = 3) =>
        mainWaitingQueue().slice(0, limit);


    // ========================================
    // 観戦者をロビー表示の最後尾へ
    // ========================================

    async function moveWatcherToBottom(person) {
        if (!person || !currentSessionId) return;

        const orders = activeMembers()
            .filter(item => item.id !== person.id)
            .map(item => Number(item.display_order))
            .filter(Number.isFinite);

        const maxOrder = orders.length
            ? Math.max(...orders)
            : 0;

        const { error } = await supabaseClient
            .from("participants")
            .update({
                display_order: maxOrder + 1,
                watcher_bonus: true
            })
            .eq("id", person.id)
            .eq("session_id", currentSessionId);

        if (error) throw error;

        updateLocal(person.id, {
            display_order: maxOrder + 1,
            watcher_bonus: true
        });
    }


    // ========================================
    // 満員時の観戦枠調整
    // 空き枠を待機列から自動補充しない
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

            // 現在観戦している人は3試合対象として記録する。
            await markExistingWatchersAsBonus();

            let active = activeMembers();

            if (active.length < cap || active.length === 0) {
                return;
            }

            let watchers = watchingMembers();

            if (watchers.length > 1) {
                const keepWatcher = watchers.at(-1);

                for (const watcher of watchers) {
                    if (watcher.id !== keepWatcher.id) {
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

                    const latest =
                        participants.find(p => p.id === bottom.id);

                    if (latest) {
                        await moveWatcherToBottom(latest);
                    }
                }

            } else {
                await moveWatcherToBottom(watchers.at(-1));
            }

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
    // 手動参加開始後も観戦枠を確認
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
    // 待機列から空いた枠を補充
    // 試合終了＋1の操作後だけ実行する
    // ========================================

    async function autoFillLobby() {
        if (
            autoBusy ||
            suppressAuto ||
            roundBusy ||
            !currentSessionId
        ) {
            return;
        }

        autoBusy = true;

        try {
            const cap = await readCapacity();

            while (activeMembers().length < cap) {
                const candidate = mainWaitingQueue()[0];

                if (!candidate) break;

                const playingCount = playingMembers().length;
                const watchingCount = watchingMembers().length;

                let nextState;

                if (playingCount < cap - 1) {
                    nextState = "playing";

                } else if (watchingCount === 0) {
                    nextState = "watching";

                } else {
                    break;
                }

                console.log(
                    "[Main Lobby] 待機列から補充:",
                    candidate.name,
                    "display_order:",
                    candidate.display_order,
                    "状態:",
                    nextState
                );

                await updateState(candidate, nextState);
                await loadParticipants();
            }

        } catch (error) {
            console.error(
                "[Main Lobby] 待機列自動補充エラー:",
                error
            );

            alert(
                "待機列からの補充に失敗しました。ブラウザのConsoleを確認してください。"
            );

        } finally {
            autoBusy = false;
        }
    }


    // ========================================
    // 試合終了＋1・自動交代
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
                .sort(orderCompare);

        const cap = await readCapacity();

        if (!currentPlayers.length) {
            alert(
                "現在、試合数を進める参加中メンバーはいません。"
            );
            return;
        }

        const ok = confirm(
            `参加中の${currentPlayers.length}人の試合数を＋1します。\n` +
            "通常の人は2試合、観戦経験のある人は3試合で再参加待機に戻ります。\n" +
            "現在の観戦者を参加状態にし、その一つ上の参加者を観戦状態にします。\n" +
            "空いた枠は待機列の先頭から補充します。\n" +
            `リスナー定員：${cap}人\n\n実行しますか？`
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

                    const nextCount = Math.min(
                        target,
                        count + 1
                    );

                    if (nextCount >= target) {
                        await finishPersonAtTarget(
                            {
                                ...person,
                                match_count: target
                            },
                            target
                        );

                        finishedCount++;

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
            // 2. 前の観戦者を参加状態へ
            // --------------------------------

            let watcherPromoted = false;

            const oldBottomWatcher = oldWatchers.at(-1);

            if (oldBottomWatcher) {
                const latestWatcher =
                    participants.find(
                        p =>
                            p.id === oldBottomWatcher.id &&
                            p.status === "playing" &&
                            stateOf(p) === "watching"
                    );

                if (latestWatcher) {
                    await updateState(latestWatcher, "playing");

                    watcherPromoted = true;

                    await loadParticipants();

                    console.log(
                        "[Main Lobby] 観戦者を参加状態へ:",
                        latestWatcher.name
                    );
                }
            }


            // --------------------------------
            // 3. 残った元参加者の最後尾を観戦へ
            // --------------------------------

            let nextWatcherId = null;

            if (watcherPromoted) {
                const survivors =
                    currentPlayers
                        .map(old =>
                            participants.find(
                                p =>
                                    p.id === old.id &&
                                    p.status === "playing" &&
                                    stateOf(p) === "playing"
                            )
                        )
                        .filter(Boolean)
                        .sort(orderCompare);

                const previousBottom = survivors.at(-1);

                if (previousBottom) {
                    await updateState(previousBottom, "watching");

                    nextWatcherId = previousBottom.id;

                    await loadParticipants();

                    console.log(
                        "[Main Lobby] 新しい観戦者:",
                        previousBottom.name
                    );
                }
            }


            // --------------------------------
            // 4. 空いた枠を待機列から補充
            // --------------------------------

            suppressAuto = false;
            roundBusy = false;

            await autoFillLobby();

            await loadParticipants();


            // --------------------------------
            // 5. 観戦者を表示上の最後尾にする
            // --------------------------------

            let finalWatcher = null;

            if (nextWatcherId) {
                finalWatcher =
                    participants.find(p => p.id === nextWatcherId);
            }

            if (!finalWatcher) {
                finalWatcher = watchingMembers().at(-1) || null;
            }

            if (finalWatcher) {
                await moveWatcherToBottom(finalWatcher);
            } else {
                await ensureBottomWatcher();
            }

            await loadParticipants();
            repaint();

            let message =
                `${success}人の試合数を更新しました。\n` +
                `${finishedCount}人が目標試合数に達し、再参加待機へ移動しました。\n` +
                "観戦者の交代と、待機列からの補充を行いました。";

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
    // 試合終了ボタン差し替え
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

        if (!dashboard || dashboard.children.length < 2) {
            return;
        }

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
    // 定員設定変更
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

        // 更新前から観戦中だった人も3試合対象にする。
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
    // 定期処理
    // 自動補充はせず、観戦ボーナスと観戦枠だけ確認
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
