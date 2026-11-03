// ========================================
// YP-Manager メインロビー試合管理・ローテーション v2
// 既存の participants / app_settings のみを使用
// ========================================
// 読み込み順：script.js / chat-users.js / rooms.js /
// main-lobby-settings.js の後
//
// ルール：
// ・通常参加者は実プレイ2試合で交代
// ・実際に1試合観戦した人は watcher_bonus=true / 3試合対象
// ・試合開始時に参加者を固定し、その人だけ試合終了時に加算
// ・観戦者は各試合終了時に参加へ戻し、下から次の人を観戦へ
// ・観戦優遇対象者はアクティブ一覧の上位に置き、3/3まで優先
// ・試合開始時点で待機していた人だけを、空いた枠へ補充
// ・試合スナップショットは app_settings に保存し、再読み込み後も復元

(function () {
    "use strict";

    if (window.__ypMainLobbyRotationV2Started) return;
    window.__ypMainLobbyRotationV2Started = true;

    const CAPACITY_KEY = "main_lobby_capacity";
    const HOST_NAME_KEY = "main_lobby_host_name";
    const MATCH_STATE_KEY = "main_lobby_match_state_v2";

    let capacity = 9;
    let capacityLoaded = false;
    let capacityReadAt = 0;
    let hostName = "";
    let matchState = null;
    let startBusy = false;
    let finishBusy = false;
    let roundButton = null;
    let startButton = null;
    let matchStatus = null;
    let dashboardObserver = null;

    // 通常の定期確認ではカード操作を止めない。
    window.ypIsMainLobbyRotationBusy = () => startBusy || finishBusy;

    // ========================================
    // 基本判定
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
            normalizeName(person && person.name) === normalizeName(hostName)
        );
    }

    function isChatOnly(person) {
        if (typeof isChatOnlyPerson === "function") {
            return isChatOnlyPerson(person);
        }
        return Boolean(
            person && (
                person.chat_only === true ||
                person.status === "chat_only" ||
                person.lobby_state === "chat_only" ||
                person.source === "chat"
            )
        );
    }

    function stateOf(person) {
        if (typeof getLobbyState === "function") {
            return getLobbyState(person);
        }
        if (person && person.lobby_state) return person.lobby_state;
        return person && person.status || "waiting";
    }

    function orderCompare(a, b) {
        const av = a && a.display_order;
        const bv = b && b.display_order;
        const aHas = av !== null && av !== undefined &&
            String(av).trim() !== "" &&
            Number.isFinite(Number(av));
        const bHas = bv !== null && bv !== undefined &&
            String(bv).trim() !== "" &&
            Number.isFinite(Number(bv));

        if (aHas && bHas && Number(av) !== Number(bv)) {
            return Number(av) - Number(bv);
        }
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;

        const joined = String(a && a.joined_at || "")
            .localeCompare(String(b && b.joined_at || ""));

        if (joined) return joined;

        return String(a && a.id || "")
            .localeCompare(String(b && b.id || ""));
    }

    function activeMembers() {
        return participants.filter(person =>
            !isChatOnly(person) &&
            !isHost(person) &&
            (person.status === "playing" || person.status === "viewer") &&
            (stateOf(person) === "playing" || stateOf(person) === "watching")
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

    function isMainWaitingCandidate(person) {
        if (window.YPQueueRules) {
            return window.YPQueueRules.isMainWaitingCandidate(person, hostName);
        }
        return Boolean(
            person &&
            person.status === "waiting" &&
            !person.room_id &&
            !isChatOnly(person) &&
            !isHost(person)
        );
    }

    function mainWaitingQueue() {
        if (window.YPQueueRules) {
            return window.YPQueueRules.sortMainWaiting(participants, hostName);
        }
        return participants.filter(isMainWaitingCandidate).sort(orderCompare);
    }

    // script.js / main-lobby-settings.js との後方互換
    window.getCurrentLobbyMembers = () => activeMembers();
    window.getNextCandidates = (limit = 3) => mainWaitingQueue().slice(0, limit);

    function updateLocal(id, patch) {
        participants = participants.map(person =>
            person.id === id ? { ...person, ...patch } : person
        );
    }

    // ========================================
    // 試合数ルール・表示
    // ========================================

    function getMatchTarget(person) {
        return person && person.watcher_bonus === true ? 3 : 2;
    }

    function getMatchCount(person) {
        const count = Number(person && person.match_count);
        if (!Number.isFinite(count)) return 0;
        return Math.max(0, Math.min(getMatchTarget(person), count));
    }

    window.getMatchTarget = getMatchTarget;
    window.getMatchCount = getMatchCount;

    function getNextCycleGameNumber() {
        if (!matchState || matchState.status !== "completed") return 1;
        return Number(matchState.cycle_game_number) === 1 ? 2 : 1;
    }

    if (
        typeof window.updateMatchDisplay === "function" &&
        !window.updateMatchDisplay.__ypRotationV2
    ) {
        const oldUpdateMatchDisplay = window.updateMatchDisplay;

        const wrappedUpdateMatchDisplay = function (personBox, person) {
            oldUpdateMatchDisplay(personBox, person);

            const countBox = Array.from(
                personBox.querySelectorAll(".date")
            ).find(element =>
                String(element.textContent || "").startsWith("試合数：")
            );

            if (countBox) {
                const count = getMatchCount(person);
                const target = getMatchTarget(person);

                countBox.textContent =
                    person && person.watcher_bonus === true
                        ? `試合数：${count} / ${target}　★ 次部屋優先`
                        : `試合数：${count} / ${target}`;

                countBox.style.fontWeight =
                    count >= target ? "bold" : "normal";

                countBox.style.color =
                    count >= target ? "#c92a2a" : "";
            }
        };

        wrappedUpdateMatchDisplay.__ypRotationV2 = true;
        window.updateMatchDisplay = wrappedUpdateMatchDisplay;
    }

    // 個別カウント・個別終了は全体スナップショットと競合するため無効化。
    window.adjustMatchCount = async function () {
        alert("試合数は『試合開始・参加者を確定』と『試合終了・カウント更新』で一括管理します。");
    };

    window.finishMatch = async function () {
        alert("個別の試合終了は使用せず、画面上部の『試合終了・カウント更新』を使ってください。");
    };

    window.finishTwoGames = async function () {
        alert("個別の2試合終了は廃止しました。全体の試合終了ボタンを使ってください。");
    };

    function removeLegacyControls() {
        const oldAllFinish =
            document.getElementById("finishAllPlayingButton");

        if (oldAllFinish) oldAllFinish.remove();

        const removeLabels = new Set([
            "− 試合数",
            "+ 試合数",
            "＋ 試合数",
            "⏹ 試合終了",
            "🔁 2試合終了"
        ]);

        document.querySelectorAll(
            "#waitingList .buttons button, #playingList .buttons button, #cancelledList .buttons button"
        ).forEach(button => {
            if (removeLabels.has(String(button.textContent || "").trim())) {
                button.remove();
            }
        });

        // 試合開始後は参加者の編成を固定する。
        // 辞退・削除・ゲーム名変更は残し、参加／観戦の切替だけを止める。
        const rosterLocked = Boolean(matchState && (
            matchState.status === "running" ||
            matchState.status === "processing"
        ));

        const rosterActions = new Set([
            "▶ 参加開始",
            "▶ 参加へ",
            "👀 観戦へ",
            "🔄 交代待ち"
        ]);

        document.querySelectorAll(
            "#waitingList .buttons button, #playingList .buttons button"
        ).forEach(button => {
            if (rosterActions.has(String(button.textContent || "").trim())) {
                button.disabled = rosterLocked;
                button.title = rosterLocked
                    ? "試合中は今回の参加者を固定しています。試合終了後に変更できます。"
                    : "";
            }
        });
    }

    if (
        typeof window.render === "function" &&
        !window.render.__ypRotationV2Wrapped
    ) {
        const oldRender = window.render;

        const wrappedRender = function (...args) {
            const result = oldRender.apply(this, args);
            removeLegacyControls();
            updateMatchControls();
            return result;
        };

        wrappedRender.__ypRotationV2Wrapped = true;
        window.render = wrappedRender;
    }

    // ========================================
    // 設定読み込み
    // ========================================

    async function readSetting(key) {
        const { data, error } = await supabaseClient
            .from("app_settings")
            .select("value")
            .eq("key", key)
            .maybeSingle();

        if (error) throw error;
        return data ? data.value : null;
    }

    async function readCapacity(force = false) {
        if (
            capacityLoaded &&
            !force &&
            Date.now() - capacityReadAt < 15000
        ) {
            return capacity;
        }

        try {
            const value = await readSetting(CAPACITY_KEY);
            const number = Number(value);

            capacity =
                Number.isInteger(number) && number >= 2 && number <= 50
                    ? number
                    : 9;

            capacityLoaded = true;
            capacityReadAt = Date.now();

        } catch (error) {
            console.error("[Main Lobby] 定員取得エラー:", error);

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

    async function loadHostName() {
        try {
            const value = await readSetting(HOST_NAME_KEY);
            hostName = value == null ? "" : String(value).trim();

            if (window.YPQueueRules) {
                window.YPQueueRules.setHostName(hostName);
            }

            const input =
                document.getElementById("mainLobbyHostNameInput");

            const status =
                document.getElementById("mainLobbyHostNameStatus");

            if (input) input.value = hostName;

            if (status) {
                status.textContent = hostName
                    ? `配信者名「${hostName}」を定員計算から除外します。`
                    : "空欄なら名前による除外は行いません。";
            }

        } catch (error) {
            console.error("[Main Lobby] 配信者名取得エラー:", error);
        }
    }

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
            <label for="mainLobbyHostNameInput" style="font-size:13px;color:#ddd;">配信者アカウント名（定員から除外）</label>
            <input id="mainLobbyHostNameInput" type="text" maxlength="60" placeholder="例：@ゆうぽんちゃんねる（任意）" style="flex:1;min-width:200px;padding:9px;border:0;border-radius:7px;font-size:14px;">
            <button id="saveMainLobbyHostName" type="button" style="padding:9px 12px;border:0;border-radius:7px;background:#398bd4;color:#fff;font-weight:bold;cursor:pointer;">配信者名を保存</button>
            <div id="mainLobbyHostNameStatus" style="width:100%;font-size:12px;color:#bbb;">空欄なら名前による除外は行いません。</div>
        `;

        panel.appendChild(block);

        document
            .getElementById("saveMainLobbyHostName")
            .addEventListener("click", async () => {
                const input =
                    document.getElementById("mainLobbyHostNameInput");

                const status =
                    document.getElementById("mainLobbyHostNameStatus");

                const button =
                    document.getElementById("saveMainLobbyHostName");

                if (!input || !button) return;

                const value = String(input.value || "").trim();

                button.disabled = true;
                button.textContent = "保存中…";

                try {
                    const { error } = await supabaseClient
                        .from("app_settings")
                        .upsert({
                            key: HOST_NAME_KEY,
                            value,
                            updated_at: new Date().toISOString()
                        }, { onConflict: "key" });

                    if (error) throw error;

                    hostName = value;

                    if (window.YPQueueRules) {
                        window.YPQueueRules.setHostName(value);
                    }

                    if (status) {
                        status.textContent = value
                            ? `配信者名「${value}」を定員計算から除外します。`
                            : "配信者名を空欄にしました。";
                    }

                    await loadParticipants();
                    repaint();

                } catch (error) {
                    console.error("[Main Lobby] 配信者名保存エラー:", error);
                    alert("配信者名を保存できませんでした。");

                } finally {
                    button.disabled = false;
                    button.textContent = "配信者名を保存";
                }
            });
    }

    // ========================================
    // スナップショット保存／読み込み
    // ========================================

    async function saveMatchState(state) {
        const { error } = await supabaseClient
            .from("app_settings")
            .upsert({
                key: MATCH_STATE_KEY,
                value: JSON.stringify(state),
                updated_at: new Date().toISOString()
            }, { onConflict: "key" });

        if (error) throw error;
        matchState = state;
    }

    async function loadMatchState() {
        try {
            const value = await readSetting(MATCH_STATE_KEY);

            if (!value) {
                matchState = null;
                return null;
            }

            let parsed;

            try {
                parsed = JSON.parse(value);
            } catch (error) {
                throw new Error("保存済み試合データをJSONとして読み取れません。");
            }

            if (!parsed || parsed.session_id !== currentSessionId) {
                matchState = null;
                return null;
            }

            matchState = parsed;
            return parsed;

        } catch (error) {
            console.error("[Main Lobby] 試合状態の読み込みエラー:", error);
            throw error;
        }
    }

    // ========================================
    // DB状態変更
    // ========================================

    async function setParticipantState(id, nextState, extraPatch = {}) {
        const patch = {
            status: "playing",
            lobby_state: nextState,
            room_id: null,
            ...extraPatch
        };

        if (nextState === "playing") {
            patch.playing_started_at = new Date().toISOString();
            patch.first_participation_pending = false;
        }

        const { data, error } = await supabaseClient
            .from("participants")
            .update(patch)
            .eq("id", id)
            .eq("session_id", currentSessionId)
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(`参加者状態を更新できませんでした: ${id}`);
        }

        updateLocal(id, patch);
    }

    async function setWatcherBonus(id) {
        // 試合終了時点でも実際に観戦状態だった人だけを優先対象にする。
        // 試合中に辞退・削除・待機復帰した人にはボーナスを付けない。
        const current = await readParticipant(id);

        if (!current) return false;
        if (!["playing", "viewer"].includes(current.status)) return false;
        if (stateOf(current) !== "watching") return false;
        if (current.watcher_bonus === true) return true;

        const { data, error } = await supabaseClient
            .from("participants")
            .update({ watcher_bonus: true })
            .eq("id", id)
            .eq("session_id", currentSessionId)
            .in("status", ["playing", "viewer"])
            .eq("lobby_state", "watching")
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            const latest = await readParticipant(id);

            if (
                !latest ||
                !["playing", "viewer"].includes(latest.status) ||
                stateOf(latest) !== "watching"
            ) {
                return false;
            }

            if (latest.watcher_bonus === true) return true;

            throw new Error(`観戦優先フラグを保存できませんでした: ${id}`);
        }

        updateLocal(id, { watcher_bonus: true });
        return true;
    }

    async function ensureRejoinEntry(person) {
        // 途中再開時に再参加行を二重作成しない。
        let query = supabaseClient
            .from("participants")
            .select("id")
            .eq("session_id", currentSessionId)
            .eq("status", "waiting")
            .eq("note", "rejoin");

        if (
            person.user_id !== null &&
            person.user_id !== undefined &&
            person.user_id !== ""
        ) {
            query = query.eq("user_id", person.user_id);
        } else {
            query = query
                .eq("name", person.name)
                .eq("source", person.source || "admin");
        }

        const { data, error } = await query.limit(1);

        if (error) throw error;
        if (data && data.length) return true;

        await loadParticipants();

        if (typeof createRejoinEntry !== "function") {
            throw new Error("再参加待機の作成関数が見つかりません。");
        }

        const created = await createRejoinEntry(person);

        if (!created) {
            throw new Error(`${person.name}さんの再参加待機を作成できませんでした。`);
        }

        await loadParticipants();
        return true;
    }

    // ========================================
    // 観戦者の整備
    // watcher_bonus はここでは付けない。
    // 実際に1試合観戦した後、試合終了処理で付与する。
    // ========================================

    async function ensureBottomWatcher() {
        if (finishBusy) return;

        if (
            matchState &&
            (matchState.status === "running" ||
             matchState.status === "processing")
        ) {
            return;
        }

        const cap = await readCapacity();

        let active = activeMembers();
        let watchers = watchingMembers();

        if (watchers.length > 1) {
            const keep = watchers[watchers.length - 1];

            for (const watcher of watchers) {
                if (watcher.id !== keep.id) {
                    await setParticipantState(watcher.id, "playing");
                }
            }

            await loadParticipants();

            active = activeMembers();
            watchers = watchingMembers();
        }

        if (watchers.length > 0) {
            await reorderActiveDisplayOrder();
            await loadParticipants();
            return;
        }

        if (active.length < cap || active.length === 0) return;

        const candidate = playingMembers()
            .filter(person => person.watcher_bonus !== true)
            .sort(orderCompare)
            .slice(-1)[0];

        if (!candidate) return;

        await setParticipantState(candidate.id, "watching");
        await loadParticipants();
        await reorderActiveDisplayOrder();
        await loadParticipants();
    }

    // ========================================
    // 試合開始ボタン／終了ボタン
    // ========================================

    function ensureControls() {
        const oldAllButton =
            document.getElementById("finishAllPlayingButton");

        if (oldAllButton) oldAllButton.remove();

        let end =
            document.getElementById("bulkFinishOneMatchButton");

        if (!end) {
            const playingList =
                document.getElementById("playingList");

            const parent =
                playingList && playingList.parentElement;

            if (!parent) return;

            end = document.createElement("button");
            end.id = "bulkFinishOneMatchButton";
            end.type = "button";
            end.className = "finish";

            parent.insertBefore(end, playingList);
        }

        // script.js が登録した旧クリックイベントを除去して付け直す。
        if (end.dataset.ypRotationV2Bound !== "true") {
            const replacement = end.cloneNode(true);
            replacement.id = "bulkFinishOneMatchButton";
            end.replaceWith(replacement);
            end = replacement;

            end.dataset.ypRotationV2Bound = "true";
            end.addEventListener("click", finishCurrentMatch);
        }

        end.textContent = "⏹ 試合終了・カウント更新";
        roundButton = end;

        let start =
            document.getElementById("startCurrentMatchButton");

        if (!start) {
            start = document.createElement("button");
            start.id = "startCurrentMatchButton";
            start.type = "button";
            start.className = "call";
            start.style.marginBottom = "8px";

            end.parentElement.insertBefore(start, end);
        }

        if (start.dataset.ypRotationV2Bound !== "true") {
            start.dataset.ypRotationV2Bound = "true";
            start.addEventListener("click", startCurrentMatch);
        }

        start.textContent = "▶ 試合開始・参加者を確定";
        startButton = start;

        let status =
            document.getElementById("currentMatchStatus");

        if (!status) {
            status = document.createElement("div");
            status.id = "currentMatchStatus";
            status.className = "date";
            status.style.margin = "6px 0 12px";

            start.parentElement.insertBefore(status, start);
        }

        matchStatus = status;
        updateMatchControls();
    }

    function updateMatchControls() {
        if (!startButton || !roundButton || !matchStatus) return;

        const running = matchState && (
            matchState.status === "running" ||
            matchState.status === "processing"
        );

        startButton.disabled =
            Boolean(running || startBusy || finishBusy);

        roundButton.disabled =
            Boolean(!running || startBusy || finishBusy);

        if (startBusy) {
            matchStatus.textContent =
                "試合開始時の参加者を保存しています…";

        } else if (finishBusy) {
            matchStatus.textContent =
                "試合終了処理中です…";

        } else if (running) {
            const names = (matchState.playing || []).length;
            const watchers = (matchState.watcher_ids || []).length;
            const cycleLabel =
                `第${Number(matchState.cycle_game_number) === 2 ? 2 : 1}戦 / 2戦`;

            matchStatus.textContent =
                matchState.status === "processing"
                    ? `${cycleLabel}：前回の試合終了処理が未完了です。『試合終了・カウント更新』で再開できます。（参加確定 ${names}人／観戦 ${watchers}人）`
                    : `${cycleLabel}：試合中。参加者 ${names}人を確定済み／観戦 ${watchers}人。試合終了後にカウントを更新してください。`;

            roundButton.textContent =
                matchState.status === "processing"
                    ? "↻ 試合終了処理を再開"
                    : "⏹ 試合終了・カウント更新";

        } else {
            const nextGameNumber = getNextCycleGameNumber();

            matchStatus.textContent =
                `次は第${nextGameNumber}戦 / 2戦。試合直前に『試合開始・参加者を確定』を押してください。開始後に加わった人は次の試合からカウントされます。`;

            roundButton.textContent =
                "⏹ 試合終了・カウント更新";
        }
    }

    async function startCurrentMatch() {
        if (startBusy || finishBusy) return;

        startBusy = true;
        updateMatchControls();

        try {
            if (!currentSessionId) {
                throw new Error("現在の配信IDがありません。");
            }

            await loadParticipants();
            await loadMatchState();

            if (
                matchState &&
                (matchState.status === "running" ||
                 matchState.status === "processing")
            ) {
                alert("すでに試合開始が記録されています。先に現在の試合を終了してください。");
                return;
            }

            await ensureBottomWatcher();
            await loadParticipants();

            const players =
                playingMembers().sort(orderCompare);

            const watchers =
                watchingMembers().sort(orderCompare);

            if (!players.length) {
                alert("参加中の人がいません。先に参加者をロビーへ入れてください。");
                return;
            }

            const cycleGameNumber = getNextCycleGameNumber();

            const ok = confirm(
                `部屋内 第${cycleGameNumber}戦 / 2戦目\n` +
                `今回の試合参加者 ${players.length}人を確定します。\n` +
                `観戦者 ${watchers.length}人はカウント対象外です。\n\n` +
                "試合が始まる直前に実行してください。よろしいですか？"
            );

            if (!ok) return;

            const snapshot = {
                version: 2,
                session_id: currentSessionId,
                cycle_game_number: cycleGameNumber,
                game_id: window.crypto &&
                    typeof window.crypto.randomUUID === "function"
                        ? window.crypto.randomUUID()
                        : `game-${Date.now()}-${Math.random().toString(36).slice(2)}`,

                status: "running",
                started_at: new Date().toISOString(),

                playing: players.map(person => ({
                    id: person.id,
                    name: person.name,
                    match_count_before: getMatchCount(person),
                    target: getMatchTarget(person)
                })),

                watcher_ids: watchers.map(person => person.id),
                waiting_ids: mainWaitingQueue().map(person => person.id),

                processed_player_ids: [],
                processed_watcher_ids: [],
                finished_player_ids: []
            };

            await saveMatchState(snapshot);
            updateMatchControls();

            console.log(
                "[Main Lobby] 試合参加者を確定:",
                snapshot
            );

        } catch (error) {
            console.error(
                "[Main Lobby] 試合開始確定エラー:",
                error
            );

            alert(
                `試合開始時の参加者を保存できませんでした。\n${error.message || error}`
            );

        } finally {
            startBusy = false;

            if (currentSessionId) {
                await loadParticipants().catch(error => console.error(error));
            }

            updateMatchControls();
            repaint();
        }
    }

    // ========================================
    // 試合参加者の試合数を1だけ加算
    // match_count_before を条件にして二重加算を防ぐ
    // ========================================

    async function readParticipant(id) {
        const { data, error } = await supabaseClient
            .from("participants")
            .select("*")
            .eq("id", id)
            .eq("session_id", currentSessionId)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    }

    async function countSnapshotPlayer(snapshotPerson) {
        let row = await readParticipant(snapshotPerson.id);

        if (!row) {
            console.warn(
                "[Main Lobby] 試合中に削除された参加者はカウントをスキップ:",
                snapshotPerson.name
            );
            return { deleted: true, finished: false };
        }

        const before =
            Number(snapshotPerson.match_count_before) || 0;

        const target =
            Number(snapshotPerson.target) === 3 ? 3 : 2;

        let current =
            Number(row.match_count) || 0;

        // 試合中に辞退された参加者は加算しない。
        if (row.status === "cancelled") {
            return {
                deleted: false,
                cancelled: true,
                finished: false
            };
        }

        if (current === before) {
            const next = Math.min(target, before + 1);

            const patch = {
                match_count: next,
                first_participation_pending: false
            };

            if (next >= target) {
                patch.status = "finished";
                patch.lobby_state = "exchange";
                patch.room_id = null;
            }

            const { data, error } = await supabaseClient
                .from("participants")
                .update(patch)
                .eq("id", snapshotPerson.id)
                .eq("session_id", currentSessionId)
                .eq("match_count", before)
                .select("id");

            if (error) throw error;

            if (!data || data.length === 0) {
                row = await readParticipant(snapshotPerson.id);

                if (!row) {
                    return { deleted: true, finished: false };
                }

                current = Number(row.match_count) || 0;

                if (current !== next) {
                    throw new Error(
                        `${snapshotPerson.name}さんの試合数が同時に変更されました。現在値 ${current} / 記録前 ${before}`
                    );
                }

            } else {
                current = next;
                row = { ...row, ...patch };
            }

        } else if (current !== before + 1) {
            throw new Error(
                `${snapshotPerson.name}さんの試合数が想定外です。開始時 ${before} / 現在 ${current}。二重加算を防ぐため停止しました。`
            );
        }

        const finished = current >= target;

        if (finished) {
            // 途中で通信が切れ、match_countだけ保存された場合も終了状態を補完。
            if (
                row.status !== "finished" ||
                row.lobby_state !== "exchange"
            ) {
                const { error } = await supabaseClient
                    .from("participants")
                    .update({
                        status: "finished",
                        lobby_state: "exchange",
                        match_count: target,
                        first_participation_pending: false,
                        room_id: null
                    })
                    .eq("id", snapshotPerson.id)
                    .eq("session_id", currentSessionId);

                if (error) throw error;
            }

            row = {
                ...row,
                status: "finished",
                lobby_state: "exchange",
                match_count: target
            };

            updateLocal(snapshotPerson.id, {
                status: "finished",
                lobby_state: "exchange",
                match_count: target,
                first_participation_pending: false,
                room_id: null
            });

            await ensureRejoinEntry(row);

        } else {
            updateLocal(snapshotPerson.id, {
                match_count: current,
                first_participation_pending: false
            });
        }

        return { deleted: false, finished };
    }

    // ========================================
    // 試合終了後のローテーション
    // ========================================

    async function promotePreviousWatchers(watcherIds) {
        for (const id of watcherIds || []) {
            // DBの最新状態を確認し、辞退した人を再び参加中へ戻さない。
            const person = await readParticipant(id);

            if (!person) continue;
            if (!["playing", "viewer"].includes(person.status)) continue;
            if (person.watcher_bonus !== true) continue;
            if (stateOf(person) !== "watching") continue;

            await setParticipantState(id, "playing");
        }

        await loadParticipants();
    }

    async function fillFromStartWaitingSnapshot(waitingIds, finishedCount) {
        let added = 0;
        const limit = Math.max(0, Number(finishedCount) || 0);
        const cap = await readCapacity();

        for (const id of waitingIds || []) {
            if (added >= limit) break;
            if (activeMembers().length >= cap) break;

            const person =
                participants.find(item => item.id === id);

            if (!person || !isMainWaitingCandidate(person)) continue;

            const activeOrders = activeMembers()
                .map(item => Number(item.display_order))
                .filter(Number.isFinite);

            const nextOrder = activeOrders.length
                ? Math.max(...activeOrders) + 1
                : 1;

            await setParticipantState(id, "playing", {
                display_order: nextOrder,
                first_participation_pending: false
            });

            added++;
        }

        if (added) await loadParticipants();
        return added;
    }

    async function ensureBottomWatcherAfterRound() {
        const cap = await readCapacity();

        let active = activeMembers();
        let watchers = watchingMembers();

        if (watchers.length > 1) {
            const keep = watchers[watchers.length - 1];

            for (const watcher of watchers) {
                if (watcher.id !== keep.id) {
                    await setParticipantState(watcher.id, "playing");
                }
            }

            await loadParticipants();

            active = activeMembers();
            watchers = watchingMembers();
        }

        if (active.length < cap || watchers.length > 0) return;

        // 次部屋優先者は観戦順の対象から外す。
        const candidate = playingMembers()
            .filter(person => person.watcher_bonus !== true)
            .sort(orderCompare)
            .slice(-1)[0];

        if (candidate) {
            await setParticipantState(candidate.id, "watching");
            await loadParticipants();
        }
    }

    async function finishCurrentMatch() {
        if (finishBusy || startBusy) return;

        finishBusy = true;
        updateMatchControls();

        try {
            if (!currentSessionId) {
                throw new Error("現在の配信IDがありません。");
            }

            const stored = await loadMatchState();

            if (
                !stored ||
                !["running", "processing"].includes(stored.status)
            ) {
                alert(
                    "試合開始時の参加者記録がありません。試合前に『試合開始・参加者を確定』を押してください。"
                );
                return;
            }

            if (stored.status === "running") {
                const ok = confirm(
                    `試合参加者 ${(stored.playing || []).length}人のカウントを更新します。\n` +
                    `観戦者 ${(stored.watcher_ids || []).length}人は今回の試合数に加算しません。\n\n実行しますか？`
                );

                if (!ok) return;
            }

            stored.status = "processing";
            await saveMatchState(stored);
            updateMatchControls();

            await loadParticipants();

            const failures = [];
            const processed = new Set(
                stored.processed_player_ids || []
            );
            const finishedIds = new Set(
                stored.finished_player_ids || []
            );

            for (const snapshotPerson of stored.playing || []) {
                try {
                    const result =
                        await countSnapshotPlayer(snapshotPerson);

                    processed.add(snapshotPerson.id);

                    if (result.finished) {
                        finishedIds.add(snapshotPerson.id);
                    }

                    stored.processed_player_ids =
                        Array.from(processed);

                    stored.finished_player_ids =
                        Array.from(finishedIds);

                    await saveMatchState(stored);

                } catch (error) {
                    console.error(
                        "[Main Lobby] 試合カウント更新エラー:",
                        snapshotPerson.name,
                        error
                    );

                    failures.push(
                        `${snapshotPerson.name}: ${error.message || error}`
                    );
                }
            }

            // 今回の試合を実際に最後まで観戦した人だけを次部屋優先にする。
            const processedWatchers = new Set(
                stored.processed_watcher_ids || []
            );

            for (const watcherId of stored.watcher_ids || []) {
                if (processedWatchers.has(watcherId)) continue;

                try {
                    await setWatcherBonus(watcherId);

                    processedWatchers.add(watcherId);

                    stored.processed_watcher_ids =
                        Array.from(processedWatchers);

                    await saveMatchState(stored);

                } catch (error) {
                    failures.push(
                        `観戦者 ${watcherId}: ${error.message || error}`
                    );
                }
            }

            if (failures.length) {
                stored.status = "processing";
                await saveMatchState(stored);

                await loadParticipants();
                repaint();

                alert(
                    "一部の処理が完了していません。\n" +
                    "『試合終了処理を再開』で未完了分を続けられます。\n\n" +
                    failures.join("\n")
                );

                return;
            }

            // 今回観戦した人は、次の試合では参加へ戻す。
            await promotePreviousWatchers(stored.watcher_ids || []);

            // 試合開始時点ですでに待機していた人から、
            // 規定試合数に達した人数分だけ補充する。
            const filled = await fillFromStartWaitingSnapshot(
                stored.waiting_ids || [],
                finishedIds.size
            );

            // 定員に達している場合、次の試合の最下位を観戦へ回す。
            await ensureBottomWatcherAfterRound();

            // 優先対象者 → 通常参加者 → 観戦者の順にする。
            await reorderActiveDisplayOrder();

            stored.status = "completed";
            stored.completed_at = new Date().toISOString();
            stored.finished_player_ids = Array.from(finishedIds);
            stored.filled_waiting_count = filled;

            await saveMatchState(stored);

            await loadParticipants();
            repaint();

            const watcherNames = (stored.watcher_ids || [])
                .map(id =>
                    participants.find(person =>
                        person.id === id &&
                        person.watcher_bonus === true
                    )?.name
                )
                .filter(Boolean);

            alert(
                `第${Number(stored.cycle_game_number) === 2 ? 2 : 1}戦の試合終了処理が完了しました。\n` +
                `カウント対象：${(stored.playing || []).length}人\n` +
                `規定試合数に達して交代：${finishedIds.size}人\n` +
                `待機列から補充：${filled}人\n` +
                `今回観戦して次部屋優先：${watcherNames.length ? watcherNames.join("、") : "なし"}`
            );

        } catch (error) {
            console.error(
                "[Main Lobby] 試合終了処理エラー:",
                error
            );

            alert(
                `試合終了処理でエラーが発生しました。\n${error.message || error}\n\n` +
                "状態は保存されているため、再読み込み後に再開できる場合があります。"
            );

        } finally {
            finishBusy = false;

            await loadParticipants().catch(error => console.error(error));

            updateMatchControls();
            repaint();
        }
    }

    // ========================================
    // display_order を優先順に整える
    // ========================================

    async function reorderActiveDisplayOrder() {
        const active = activeMembers();

        if (!active.length) return;

        const priority = active
            .filter(person =>
                person.watcher_bonus === true &&
                stateOf(person) === "playing"
            )
            .sort(orderCompare);

        const ordinary = active
            .filter(person =>
                person.watcher_bonus !== true &&
                stateOf(person) === "playing"
            )
            .sort(orderCompare);

        const watchers = active
            .filter(person => stateOf(person) === "watching")
            .sort(orderCompare);

        const ordered = [
            ...priority,
            ...ordinary,
            ...watchers
        ];

        const orders = [...new Set(
            active
                .map(person => Number(person.display_order))
                .filter(Number.isFinite)
        )].sort((a, b) => a - b);

        let next = orders.length
            ? orders[orders.length - 1] + 1
            : 1;

        while (orders.length < ordered.length) {
            orders.push(next++);
        }

        for (let index = 0; index < ordered.length; index++) {
            const person = ordered[index];
            const desired = orders[index];

            if (Number(person.display_order) === desired) continue;

            const { error } = await supabaseClient
                .from("participants")
                .update({ display_order: desired })
                .eq("id", person.id)
                .eq("session_id", currentSessionId);

            if (error) throw error;

            updateLocal(person.id, {
                display_order: desired
            });
        }
    }

    // ========================================
    // 画面表示
    // ========================================

    function repaint() {
        if (typeof window.render === "function") {
            window.render();
        }

        removeLegacyControls();
        updateMatchControls();
        updateDashboard();
    }

function updateDashboard() {
    const dashboard = document.getElementById("lobbyDashboard");
    if (!dashboard || dashboard.children.length < 2) return;

    const active = activeMembers();
    const playing = active.filter(person => stateOf(person) === "playing").length;
    const watching = active.filter(person => stateOf(person) === "watching").length;
    const waiting = participants.filter(isMainWaitingCandidate).length;
    const priority = active.filter(person => person.watcher_bonus === true).length;

    const title = `🎮 メインロビー ${active.length} / ${capacity}人`;
    const stats = `🟢 参加中 ${playing}人　👀 観戦 ${watching}人　⭐ 次部屋優先 ${priority}人　🟡 待機 ${waiting}人`;

    // 表示内容が変わったときだけ書き換える。
    // MutationObserverによる無限ループを防ぐ。
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

        dashboardObserver.observe(dashboard, {
            childList: true,
            subtree: true,
            characterData: true
        });

        updateDashboard();
    }

    // ========================================
    // 定員保存後の更新
    // ========================================

    function bindCapacitySaveRefresh() {
        const button =
            document.getElementById("saveMainLobbyCapacity");

        if (
            !button ||
            button.dataset.ypRotationV2Bound === "true"
        ) {
            return;
        }

        button.dataset.ypRotationV2Bound = "true";

        button.addEventListener("click", () => {
            setTimeout(async () => {
                await readCapacity(true);
                updateDashboard();

                if (!matchState || matchState.status === "completed") {
                    await ensureBottomWatcher();
                }
            }, 800);
        });
    }

    // ========================================
    // 初期化・定期監視
    // ========================================

    async function waitForSession() {
        for (let i = 0; i < 100; i++) {
            if (currentSessionId) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return Boolean(currentSessionId);
    }

    async function initialize() {
        ensureControls();
        removeLegacyControls();

        await readCapacity(true);
        addHostNameControl();
        await loadHostName();
        bindCapacitySaveRefresh();

        await waitForSession();

        if (!currentSessionId) {
            updateMatchControls();
            return;
        }

        await loadParticipants();
        await loadMatchState();

        // 完了済み、または試合状態がないときだけ初期観戦枠を整える。
        if (!matchState || matchState.status === "completed") {
            await ensureBottomWatcher();
            await reorderActiveDisplayOrder();
            await loadParticipants();
        }

        ensureControls();
        removeLegacyControls();
        observeDashboard();
        updateDashboard();
        updateMatchControls();
        repaint();
    }

    initialize().catch(error => {
        console.error("[Main Lobby] 初期化エラー:", error);

        alert(
            `メインロビー試合管理の初期化に失敗しました。\n${error.message || error}`
        );
    });

    setInterval(async () => {
        if (startBusy || finishBusy) return;

        try {
            await readCapacity();
            addHostNameControl();
            bindCapacitySaveRefresh();
            ensureControls();
            removeLegacyControls();
            updateMatchControls();
            updateDashboard();

            // 試合中は観戦者を動かさない。
            if (!matchState || matchState.status === "completed") {
                await ensureBottomWatcher();
            }

        } catch (error) {
            console.warn("[Main Lobby] 定期確認エラー:", error);
        }
    }, 5000);

})();