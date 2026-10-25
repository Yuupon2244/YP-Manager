// ========================================
// YP-Manager メインロビー自動補充・試合ローテーション
// ========================================
// script.js / rooms.js / main-lobby-settings.js の後に読み込む。
// 古い auto-lobby.js は併用しない（index.htmlで無効化する）。

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

    let roundButton = null;
    let dashboardObserver = null;


    // ========================================
    // メインロビー定員
    // 待機部屋の定員とは別に管理する
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

            const {
                data,
                error
            } = await supabaseClient
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

        // 既存管理画面の定員判定もメインロビー専用にする。
        // rooms.js の待機部屋定員は変更しない。
        window.getRoomCapacity = () => capacity;

        return capacity;
    }


    // ========================================
    // 名前の正規化・配信者本人の除外
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


    function orderCompare(a, b) {
    const hasOrder = person =>
        person?.display_order !== null &&
        person?.display_order !== undefined &&
        String(person.display_order).trim() !== "" &&
        Number.isFinite(Number(person.display_order));

    const aHasOrder = hasOrder(a);
    const bHasOrder = hasOrder(b);

    const x = Number(a?.display_order);
    const y = Number(b?.display_order);

    if (aHasOrder && bHasOrder && x !== y) {
        return x - y;
    }

    if (aHasOrder && !bHasOrder) {
        return -1;
    }

    if (!aHasOrder && bHasOrder) {
        return 1;
    }

    const joinedCompare =
        String(a?.joined_at || "").localeCompare(
            String(b?.joined_at || "")
        );

    if (joinedCompare !== 0) {
        return joinedCompare;
    }

    return String(a?.id || "").localeCompare(
        String(b?.id || "")
    );
}


    // ========================================
    // メインロビーの人数を取得
    // 配信者本人はリスナー定員に含めない
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
            .filter(person =>
                stateOf(person) === "playing"
            )
            .sort(orderCompare);
    }


    function watchingMembers() {

        return activeMembers()
            .filter(person =>
                stateOf(person) === "watching"
            )
            .sort(orderCompare);
    }


    // ========================================
    // メイン待機列
    // room_idがある人は視聴者用の待機部屋に所属しているため除外
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
            // 初回参加の優先順位は維持
            const aNew =
                a.first_participation_pending === true ? 0 : 1;

            const bNew =
                b.first_participation_pending === true ? 0 : 1;

            if (aNew !== bNew) {
                return aNew - bNew;
            }

            // それ以外は、実際の待機順に従う
            return orderCompare(a, b);
        });
}

    function updateLocal(id, patch) {

        participants = participants.map(
            person =>
                person.id === id
                    ? { ...person, ...patch }
                    : person
        );
    }


    // ========================================
    // ロビー状態を変更
    // ========================================

    async function updateState(person, nextState) {

        if (
            !person ||
            !currentSessionId
        ) {
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

        const {
            data,
            error
        } = await supabaseClient
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

        updateLocal(
            person.id,
            patch
        );
    }


    // 既存の定員チェック・次候補一覧もメインロビー用にする。
    window.getRoomCapacity = () => capacity;

    window.getCurrentLobbyMembers = () =>
        activeMembers();

    window.getNextCandidates = (limit = 3) =>
        mainWaitingQueue().slice(0, limit);


    // ========================================
    // 待機列からメインロビーへ自動補充
    //
    // 定員9人の場合：
    // 参加中8人＋観戦1人
    //
    // 定員N人の場合：
    // 参加中最大N-1人＋観戦1人
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

            let active = activeMembers();

            // 現在の定員を超えている場合は、勝手に退出させない。
            if (active.length > cap) {

                console.warn(
                    `[Main Lobby] 定員超過中 ${active.length}/${cap}。既存メンバーは自動退出させません。`
                );

                return;
            }

            let watchers = watchingMembers();

            // 満員なのに観戦者がいなければ、最後尾を観戦にする。
            if (
                active.length === cap &&
                watchers.length === 0
            ) {

                const last =
                    playingMembers().at(-1);

                if (last) {
                    await updateState(
                        last,
                        "watching"
                    );
                }
            }

            // 観戦者は原則1人。
            // 複数いる場合は最後尾だけ残し、他の人を参加中に戻す。
            watchers = watchingMembers();

            if (watchers.length > 1) {

                const keepId =
                    watchers.at(-1).id;

                for (const watcher of watchers) {

                    if (watcher.id !== keepId) {

                        await updateState(
                            watcher,
                            "playing"
                        );
                    }
                }
            }

            let guard = 0;

            while (
                activeMembers().length < cap &&
                guard < cap + 2
            ) {

                guard++;

                const candidate =
                    mainWaitingQueue()[0];

                if (!candidate) break;

                const playingCount =
                    playingMembers().length;

                const watchingCount =
                    watchingMembers().length;

                let nextState;

                if (
                    playingCount < cap - 1
                ) {

                    nextState = "playing";

                } else if (
                    watchingCount === 0
                ) {

                    nextState = "watching";

                } else {

                    // 参加中N-1人＋観戦1人で満員。
                    break;
                }

                await updateState(
                    candidate,
                    nextState
                );
            }

            // 最終的に満員なら観戦枠を1人に整える。
            active = activeMembers();
            watchers = watchingMembers();

            if (
                active.length === cap &&
                watchers.length === 0
            ) {

                const last =
                    playingMembers().at(-1);

                if (last) {
                    await updateState(
                        last,
                        "watching"
                    );
                }

            } else if (
                watchers.length > 1
            ) {

                const keepId =
                    watchers.at(-1).id;

                for (const watcher of watchers) {

                    if (watcher.id !== keepId) {

                        await updateState(
                            watcher,
                            "playing"
                        );
                    }
                }
            }

            repaint();

        } catch (error) {

            console.error(
                "[Main Lobby] 待機列自動補充エラー:",
                error
            );

        } finally {

            autoBusy = false;
        }
    }


    function repaint() {

        if (typeof render === "function") {
            render();
        }

        updateDashboard();
    }


    // ========================================
    // 試合終了・自動ローテーション
    // ========================================

    async function finishRoundAndRotate() {

        if (
            !currentSessionId ||
            roundBusy
        ) {
            return;
        }

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
            "観戦中と配信者本人は試合数に含めません。\n" +
            "2試合終了した人は再参加待機へ戻し、観戦枠を交代して、待機列の先頭から補充します。\n" +
            `リスナー定員：${cap}人（最大${cap - 1}人参加＋観戦1人）\n\n実行しますか？`
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
                        participants.find(
                            p => p.id === snapshot.id
                        ) || snapshot;

                    const count =
                        typeof getMatchCount === "function"
                            ? getMatchCount(person)
                            : Math.max(
                                0,
                                Number(person.match_count) || 0
                            );

                    const nextCount =
                        Math.min(
                            2,
                            count + 1
                        );

                    if (nextCount <= count) {
                        continue;
                    }

                    if (nextCount >= 2) {

                        // 2試合目終了：現在の参加履歴を終了にする。
                        const {
                            data,
                            error
                        } = await supabaseClient
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

                        updateLocal(
                            person.id,
                            {
                                status: "finished",
                                lobby_state: "exchange",
                                match_count: 2,
                                first_participation_pending: false,
                                room_id: null
                            }
                        );

                        // 既存の再参加待機処理を利用する。
                        // 追加ごとに読み直し、順番番号の重複を防ぐ。
                        await loadParticipants();

                        const latest =
                            participants.find(
                                p => p.id === person.id
                            ) || person;

                        const created =
                            await createRejoinEntry(
                                latest
                            );

                        if (!created) {
                            throw new Error(
                                "再参加待機への追加に失敗しました。"
                            );
                        }

                        await loadParticipants();

                        finishedTwo++;

                    } else {

                        // 1試合目終了：参加中のまま試合数だけ更新。
                        const {
                            error
                        } = await supabaseClient
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

                        updateLocal(
                            person.id,
                            {
                                match_count: nextCount,
                                first_participation_pending: false,
                                lobby_state: "playing",
                                status: "playing"
                            }
                        );
                    }

                    success++;

                } catch (error) {

                    console.error(
                        "[Main Lobby] 試合数更新エラー:",
                        snapshot.name,
                        error
                    );

                    failed.push(
                        snapshot.name || "名前不明"
                    );
                }
            }

            await loadParticipants();


            // --------------------------------
            // 2. 前の観戦者（最後尾）を参加中へ戻す
            // --------------------------------

            let watcherPromoted = false;

            const oldBottomWatcher =
                oldWatchers.at(-1);

            if (oldBottomWatcher) {

                const latestWatcher =
                    participants.find(
                        p =>
                            p.id === oldBottomWatcher.id &&
                            p.status === "playing" &&
                            stateOf(p) === "watching"
                    );

                if (latestWatcher) {

                    await updateState(
                        latestWatcher,
                        "playing"
                    );

                    watcherPromoted = true;

                    await loadParticipants();
                }
            }


            // --------------------------------
            // 3. 残った元参加者の最後尾を新しい観戦者にする
            // --------------------------------

            if (watcherPromoted) {

                const survivors =
                    currentPlayers
                        .map(
                            old =>
                                participants.find(
                                    p =>
                                        p.id === old.id &&
                                        p.status === "playing" &&
                                        stateOf(p) === "playing"
                                )
                        )
                        .filter(Boolean)
                        .sort(orderCompare);

                const nextWatcher =
                    survivors.at(-1);

                if (nextWatcher) {

                    await updateState(
                        nextWatcher,
                        "watching"
                    );

                    await loadParticipants();
                }
            }


            // --------------------------------
            // 4. 空いた枠を待機列の先頭から補充
            // --------------------------------

            suppressAuto = false;

            await autoFillLobby();

            await loadParticipants();

            repaint();

            let message =
                `${success}人の試合数を更新しました。\n` +
                `${finishedTwo}人が2試合終了となり、再参加待機へ移動しました。\n` +
                "観戦枠を交代し、待機列から自動補充しました。";

            if (failed.length) {

                message +=
                    `\n\n処理できなかった参加者：\n${failed.join("、")}`;
            }

            alert(message);

        } catch (error) {

            console.error(
                "[Main Lobby] ラウンド交代エラー:",
                error
            );

            alert(
                "試合終了後の自動交代でエラーが発生しました。参加者一覧とログを確認してください。"
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

            setTimeout(
                autoFillLobby,
                0
            );
        }
    }


    // ========================================
    // 既存の「今の試合終了」ボタンを差し替える
    // 古いクリック処理を外し、二重実行を防ぐ
    // ========================================

    function bindRoundButton() {

        const original =
            document.getElementById(
                "bulkFinishOneMatchButton"
            );

        if (!original) return;

        if (
            original.dataset.ypRotationBound === "true"
        ) {
            roundButton = original;
            return;
        }

        const replacement =
            original.cloneNode(true);

        replacement.id =
            "bulkFinishOneMatchButton";

        replacement.dataset.ypRotationBound =
            "true";

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
    // 人数表示
    // 参加中の分母もリスナー定員Nにする（例：1/9）
    // ========================================

    function updateDashboard() {

        const dashboard =
            document.getElementById(
                "lobbyDashboard"
            );

        if (
            !dashboard ||
            dashboard.children.length < 2
        ) {
            return;
        }

        const active =
            activeMembers();

        const playing =
            active.filter(
                p => stateOf(p) === "playing"
            ).length;

        const watching =
            active.filter(
                p => stateOf(p) === "watching"
            ).length;

        const waiting =
            participants.filter(
                isMainWaitingCandidate
            ).length;

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

        if (
            dashboard.children[0].textContent !== title
        ) {

            dashboard.children[0].textContent =
                title;

            dashboard.children[0].style.fontWeight =
                "bold";

            dashboard.children[0].style.marginBottom =
                "8px";
        }

        if (
            dashboard.children[1].textContent !== stats
        ) {

            dashboard.children[1].textContent =
                stats;

            dashboard.children[1].style.marginBottom =
                "8px";
        }
    }


    function observeDashboard() {

        const dashboard =
            document.getElementById(
                "lobbyDashboard"
            );

        if (
            !dashboard ||
            dashboardObserver
        ) {
            return;
        }

        dashboardObserver =
            new MutationObserver(
                updateDashboard
            );

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
    // 配信者本人の名前を定員計算から除外する設定
    // ========================================

    function addHostNameControl() {

        const panel =
            document.getElementById(
                "mainLobbySettingsPanel"
            );

        if (
            !panel ||
            document.getElementById(
                "mainLobbyHostNameInput"
            )
        ) {
            return;
        }

        const block =
            document.createElement("div");

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
            .addEventListener(
                "click",
                saveHostName
            );
    }


    async function loadHostName() {

        try {

            const {
                data,
                error
            } = await supabaseClient
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
                document.getElementById(
                    "mainLobbyHostNameInput"
                );

            const status =
                document.getElementById(
                    "mainLobbyHostNameStatus"
                );

            if (input) {
                input.value = hostName;
            }

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
            document.getElementById(
                "mainLobbyHostNameInput"
            );

        const status =
            document.getElementById(
                "mainLobbyHostNameStatus"
            );

        const button =
            document.getElementById(
                "saveMainLobbyHostName"
            );

        if (!input || !button) return;

        button.disabled = true;
        button.textContent = "保存中…";

        const value =
            String(input.value || "").trim();

        try {

            const {
                error
            } = await supabaseClient
                .from("app_settings")
                .upsert(
                    {
                        key: HOST_NAME_KEY,
                        value,
                        updated_at:
                            new Date().toISOString()
                    },
                    {
                        onConflict: "key"
                    }
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

            await autoFillLobby();

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
    // 定員設定変更後に新しい値を再取得
    // ========================================

    function bindCapacitySaveRefresh() {

        const button =
            document.getElementById(
                "saveMainLobbyCapacity"
            );

        if (
            !button ||
            button.dataset.ypCapacityRefreshBound === "true"
        ) {
            return;
        }

        button.dataset.ypCapacityRefreshBound = "true";

        button.addEventListener(
            "click",
            () => {

                setTimeout(
                    async () => {

                        await readCapacity(true);

                        window.getRoomCapacity =
                            () => capacity;

                        updateDashboard();

                        await autoFillLobby();
                    },
                    800
                );
            }
        );
    }


    // ========================================
    // 起動
    // ========================================

    async function initialize() {

        await readCapacity(true);

        addHostNameControl();

        await loadHostName();

        bindRoundButton();

        bindCapacitySaveRefresh();

        observeDashboard();

        updateDashboard();

        await autoFillLobby();
    }


    initialize().catch(
        error =>
            console.error(
                "[Main Lobby] 初期化エラー:",
                error
            )
    );


    // 2.5秒ごとに待機列を確認。
    // 自動参加で空き枠を補充する。
    setInterval(
        async () => {

            if (
                roundBusy ||
                suppressAuto
            ) {
                return;
            }

            await readCapacity();

            bindRoundButton();

            addHostNameControl();

            bindCapacitySaveRefresh();

            observeDashboard();

            updateDashboard();

            await autoFillLobby();
        },
        2500
    );

})();
