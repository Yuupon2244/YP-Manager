// ========================================
// YP-Manager メインロビー自動補充・試合ローテーション
// ========================================
// script.js / rooms.js / main-lobby-settings.js の後に読み込む。
// 古い auto-lobby.js は併用しない。
//
// 動作:
// ・手動参加で満員になったら最後尾を観戦にする
// ・試合終了＋1で試合数を更新する
// ・2試合になった人は再参加待機の最後尾へ移動
// ・旧観戦者を参加状態へ戻す
// ・その一つ上の参加者を観戦状態にする
// ・空いた枠を待機列の先頭から補充する
// ・個人／全体の2試合終了では自動補充しない
// ・定期処理では空き枠を自動補充しない

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
    // 初回参加者を優先し、それ以外は待機順
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
            patch.playing_started_at =
                new Date().toISOString();
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
    // 観戦者をロビー一覧の最後尾にする
    // ========================================

    async function moveWatcherToBottom(person) {
        if (!person || !currentSessionId) return;

        const active = activeMembers();

        const orders = active
            .filter(item => item.id !== person.id)
            .map(item => Number(item.display_order))
            .filter(Number.isFinite);

        const maxOrder =
            orders.length > 0
                ? Math.max(...orders)
                : 0;

        const nextOrder = maxOrder + 1;

        const { error } = await supabaseClient
            .from("participants")
            .update({
                display_order: nextOrder
            })
            .eq("id", person.id)
            .eq("session_id", currentSessionId);

        if (error) throw error;

        updateLocal(person.id, {
            display_order: nextOrder
        });
    }


    // ========================================
    // 満員時の観戦枠を調整
    //
    // 観戦者がすでに1人いる場合：
    // その人を維持し、一覧の最後尾へ移動する。
    //
    // 観戦者がいない場合：
    // 最後尾を観戦状態にする。
    //
    // 待機列から新しい人を呼ぶ処理はしない。
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
            let active = activeMembers();

            if (active.length < cap) return;
            if (active.length === 0) return;

            let watchers = watchingMembers();

            if (watchers.length > 1) {
                // 複数いる場合は順番上の最後尾を維持する。
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
                // 既存の観戦者は変更せず、表示上の最後尾へ整える。
                const watcher = watchers[0];

                await moveWatcherToBottom(watcher);
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
    // 既存画面との連携
    // ========================================

    window.getRoomCapacity = () => capacity;
    window.getCurrentLobbyMembers = () => activeMembers();

    window.getNextCandidates = (limit = 3) =>
        mainWaitingQueue().slice(0, limit);

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
    //
    // 1. 参加中の人だけ試合数＋1
    // 2. 2試合の人は再参加待機へ
    // 3. 観戦者を参加状態へ戻す
    // 4. その一つ上の人を観戦状態へ
    // 5. 空いた枠を待機列から補充
    // 6. 観戦者を最後尾に整える
    // ========================================

    async function finishRoundAndRotate() {
        if (!currentSessionId || roundBusy) return;

        const currentPlayers =
            playingMembers()
                .slice()
                .sort(orderCompare);

        // 試合終了処理の前に、現在の観戦者を記録しておく。
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
            "2試合になった人は再参加待機の最後尾へ移動します。\n" +
            "現在の観戦者を参加状態にし、その一つ上の人を観戦状態にします。\n" +
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
        let finishedTwo = 0;

        try {
            // --------------------------------
            // 1. 参加中の人だけ試合数を＋1
            // --------------------------------

            for (const snapshot of currentPlayers) {
                try {
                    const person =
                        participants.find(p => p.id === snapshot.id) ||
                        snapshot;

                    const count =
                        typeof getMatchCount === "function"
                            ? getMatchCount(person)
                            : Math.max(
                                0,
                                Number(person.match_count) || 0
                            );

                    const nextCount = Math.min(2, count + 1);

                    if (nextCount <= count) continue;

                    if (nextCount >= 2) {
                        const { data, error } = await supabaseClient
                            .from("participants")
                            .update({
                                status: "finished",
                                lobby_state: "exchange",
                                match_count: 2,
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
                                "2試合終了の更新に失敗しました。"
                            );
                        }

                        updateLocal(person.id, {
                            status: "finished",
                            lobby_state: "exchange",
                            match_count: 2,
                            first_participation_pending: false,
                            room_id: null
                        });

                        await loadParticipants();

                        const latest =
                            participants.find(p => p.id === person.id) ||
                            person;

                        const created =
                            await createRejoinEntry(latest);

                        if (!created) {
                            throw new Error(
                                "再参加待機への追加に失敗しました。"
                            );
                        }

                        await loadParticipants();
                        finishedTwo++;

                    } else {
                        // 1試合目終了：参加中のまま残す。
                        const { error } = await supabaseClient
                            .from("participants")
                            .update({
                                match_count: 1,
                                first_participation_pending: false,
                                lobby_state: "playing",
                                status: "playing"
                            })
                            .eq("id", person.id)
                            .eq("session_id", currentSessionId)
                            .eq("status", "playing");

                        if (error) throw error;

                        updateLocal(person.id, {
                            match_count: 1,
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
            // 2. 旧観戦者を参加状態へ戻す
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
            // 3. 一つ上の参加者を観戦状態へ
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
            // 4. 空いた枠を待機列の先頭から補充
            // --------------------------------

            suppressAuto = false;
            roundBusy = false;

            await autoFillLobby();

            // --------------------------------
            // 5. 観戦者を表示上の最後尾に整える
            // --------------------------------

            await loadParticipants();

            let finalWatcher = null;

            if (nextWatcherId) {
                finalWatcher =
                    participants.find(p => p.id === nextWatcherId);
            }

            if (!finalWatcher) {
                const watchers = watchingMembers();
                finalWatcher = watchers.at(-1) || null;
            }

            if (finalWatcher) {
                await moveWatcherToBottom(finalWatcher);
            } else {
                // 観戦者がいない状態で満員なら最後尾を観戦にする。
                await ensureBottomWatcher();
            }

            await loadParticipants();
            repaint();

            let message =
                `${success}人の試合数を更新しました。\n` +
                `${finishedTwo}人が2試合終了となり、再参加待機へ移動しました。\n` +
                "観戦者を参加状態にし、その一つ上の人を観戦状態にしました。\n" +
                "空いた枠には待機列から補充しました。";

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
    // 配信者名の設定
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

        observeDashboard();
        updateDashboard();

        await ensureBottomWatcher();
    }

    initialize().catch(error =>
        console.error("[Main Lobby] 初期化エラー:", error)
    );


    // ========================================
    // 定期処理
    // 空き枠の自動補充はしない。
    // 定員到達時の観戦枠と表示だけを整える。
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

        observeDashboard();
        updateDashboard();

        await ensureBottomWatcher();

    }, 2500);

})();
