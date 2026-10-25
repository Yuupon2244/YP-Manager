// ========================================
// YP-Manager メインロビー人数設定・人数表示
// v1.0.0
// ========================================

(function () {
    "use strict";

    const DEFAULT_CAPACITY = 9;
    const MIN_CAPACITY = 2;
    const MAX_CAPACITY = 50;
    const SETTINGS_KEY = "main_lobby_capacity";

    let mainLobbyCapacity = DEFAULT_CAPACITY;
    let saving = false;

    // ========================================
    // 現在のメインロビー定員
    // ========================================

    window.ypGetMainLobbyCapacity = function () {
        return mainLobbyCapacity;
    };

    /*
     * script.js の既存処理が呼ぶ getRoomCapacity() を
     * メインロビー専用の定員に切り替える。
     *
     * 視聴者用待機部屋の rooms.capacity は変更しない。
     */
    window.getRoomCapacity = function () {
        return mainLobbyCapacity;
    };


    // ========================================
    // 設定パネルを作成
    // ========================================

    function createPanel() {
        if (
            document.getElementById(
                "mainLobbySettingsPanel"
            )
        ) {
            return;
        }

        const sessionStatus =
            document.getElementById(
                "sessionStatus"
            );

        const container =
            sessionStatus?.parentElement;

        if (!container) {
            console.error(
                "[YP Main Lobby] 表示場所がありません。"
            );
            return;
        }

        const panel =
            document.createElement("section");

        panel.id = "mainLobbySettingsPanel";

        panel.style.cssText = [
            "margin:16px 0 22px",
            "padding:15px",
            "background:#363636",
            "border-radius:12px",
            "color:#fff"
        ].join(";");

        panel.innerHTML = `
            <div style="
                font-size:18px;
                font-weight:bold;
                margin-bottom:8px;
            ">
                🎮 メインロビー設定
            </div>

            <div style="
                color:#ccc;
                font-size:13px;
                line-height:1.6;
                margin-bottom:12px;
            ">
                視聴者が作る待機部屋とは別の設定です。
                最大人数には観戦枠も含めます。
            </div>

            <div style="
                display:flex;
                align-items:center;
                gap:8px;
                flex-wrap:wrap;
            ">
                <label for="mainLobbyCapacityInput">
                    最大人数
                </label>

                <input
                    id="mainLobbyCapacityInput"
                    type="number"
                    min="2"
                    max="50"
                    step="1"
                    value="9"
                    style="
                        width:85px;
                        padding:9px;
                        border:0;
                        border-radius:7px;
                        font-size:16px;
                    "
                >

                <span>人</span>

                <button
                    id="saveMainLobbyCapacity"
                    type="button"
                    style="
                        padding:10px 15px;
                        border:0;
                        border-radius:7px;
                        background:#39b54a;
                        color:#fff;
                        font-weight:bold;
                        cursor:pointer;
                    "
                >
                    設定を保存
                </button>
            </div>

            <div
                id="mainLobbyCapacityDescription"
                style="
                    margin-top:10px;
                    color:#ddd;
                    font-size:13px;
                "
            ></div>

            <div
                id="mainLobbyCapacityStatus"
                role="status"
                style="
                    margin-top:8px;
                    color:#b8d8ff;
                    font-size:12px;
                "
            >
                設定を読み込み中…
            </div>
        `;

        container.insertBefore(
            panel,
            sessionStatus.nextSibling
        );

        document
            .getElementById("saveMainLobbyCapacity")
            .addEventListener(
                "click",
                saveCapacity
            );

        document
            .getElementById("mainLobbyCapacityInput")
            .addEventListener(
                "input",
                updateDescription
            );

        updateDescription();
    }


    // ========================================
    // 設定説明
    // ========================================

    function updateDescription() {
        const input =
            document.getElementById(
                "mainLobbyCapacityInput"
            );

        const description =
            document.getElementById(
                "mainLobbyCapacityDescription"
            );

        if (!input || !description) {
            return;
        }

        const capacity =
            Number(input.value);

        if (
            !Number.isInteger(capacity) ||
            capacity < MIN_CAPACITY ||
            capacity > MAX_CAPACITY
        ) {
            description.textContent =
                "2～50の整数を入力してください。";
            return;
        }

        description.textContent =
            `満員時の想定：参加中 ${capacity - 1}人 ＋ 観戦 1人`;
    }


    // ========================================
    // 保存済み定員を読み込む
    // ========================================

    async function loadCapacity() {
        const status =
            document.getElementById(
                "mainLobbyCapacityStatus"
            );

        const input =
            document.getElementById(
                "mainLobbyCapacityInput"
            );

        try {
            const { data, error } =
                await supabaseClient
                    .from("app_settings")
                    .select("value")
                    .eq("key", SETTINGS_KEY)
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (data && data.value != null) {
                const stored =
                    Number(data.value);

                if (
                    Number.isInteger(stored) &&
                    stored >= MIN_CAPACITY &&
                    stored <= MAX_CAPACITY
                ) {
                    mainLobbyCapacity = stored;
                }
            }

            input.value =
                String(mainLobbyCapacity);

            updateDescription();

            if (status) {
                status.textContent =
                    data
                        ? "設定を読み込みました。"
                        : "初期設定は9人です。変更した場合は「設定を保存」を押してください。";
            }

            updateLobbyDisplay();

        } catch (error) {
            console.error(
                "[YP Main Lobby] 定員取得エラー:",
                error
            );

            if (status) {
                status.textContent =
                    "設定の読み込みに失敗しました。初期値9人で表示しています。";
            }
        }
    }


    // ========================================
    // 定員を保存
    // ========================================

    async function saveCapacity() {
        if (saving) {
            return;
        }

        const input =
            document.getElementById(
                "mainLobbyCapacityInput"
            );

        const button =
            document.getElementById(
                "saveMainLobbyCapacity"
            );

        const status =
            document.getElementById(
                "mainLobbyCapacityStatus"
            );

        const capacity =
            Number(input.value);

        if (
            !Number.isInteger(capacity) ||
            capacity < MIN_CAPACITY ||
            capacity > MAX_CAPACITY
        ) {
            alert(
                "最大人数は2～50の整数で入力してください。"
            );
            return;
        }

        const currentLobby =
            getLobbyCounts();

        if (
            currentLobby.total > capacity
        ) {
            const confirmed =
                window.confirm(
                    `現在ロビーに${currentLobby.total}人います。\n` +
                    `変更後の定員は${capacity}人です。\n` +
                    "すでに入っている人を自動退出させることはありません。\n" +
                    "定員を変更しますか？"
                );

            if (!confirmed) {
                return;
            }
        }

        saving = true;
        button.disabled = true;
        button.textContent = "保存中…";

        try {
            const { error } =
                await supabaseClient
                    .from("app_settings")
                    .upsert(
                        {
                            key: SETTINGS_KEY,
                            value: String(capacity),
                            updated_at:
                                new Date().toISOString()
                        },
                        {
                            onConflict: "key"
                        }
                    );

            if (error) {
                throw error;
            }

            mainLobbyCapacity = capacity;

            input.value =
                String(capacity);

            updateDescription();
            updateLobbyDisplay();

            if (typeof render === "function") {
                render();
            }

            status.textContent =
                `メインロビーの最大人数を${capacity}人に保存しました。`;

        } catch (error) {
            console.error(
                "[YP Main Lobby] 定員保存エラー:",
                error
            );

            status.textContent =
                "保存できませんでした。通信状態やSupabaseの権限を確認してください。";

            alert(
                "最大人数を保存できませんでした。"
            );

        } finally {
            saving = false;
            button.disabled = false;
            button.textContent = "設定を保存";
        }
    }


    // ========================================
    // 現在の人数を集計
    // ========================================

    function getLobbyCounts() {
        const list =
            typeof participants !== "undefined" &&
            Array.isArray(participants)
                ? participants
                : [];

        const eligible =
            list.filter(
                person =>
                    typeof isChatOnlyPerson === "function"
                        ? !isChatOnlyPerson(person)
                        : person?.source !== "chat"
            );

        const playing =
            eligible.filter(
                person =>
                    typeof getLobbyState === "function"
                        ? getLobbyState(person) === "playing"
                        : person.status === "playing"
            ).length;

        const watching =
            eligible.filter(
                person =>
                    typeof getLobbyState === "function"
                        ? getLobbyState(person) === "watching"
                        : person.status === "viewer"
            ).length;

        const waiting =
            eligible.filter(
                person =>
                    person.status === "waiting"
            ).length;

        const exchange =
            typeof getExchangeWaiting === "function"
                ? getExchangeWaiting().length
                : 0;

        return {
            playing,
            watching,
            waiting,
            exchange,
            total: playing + watching
        };
    }


    // ========================================
    // 既存ダッシュボードの見た目を更新
    // ========================================

    function updateLobbyDisplay() {
        const dashboard =
            document.getElementById(
                "lobbyDashboard"
            );

        if (!dashboard) {
            return;
        }

        const counts =
            getLobbyCounts();

        const capacity =
            mainLobbyCapacity;

        const title =
            dashboard.children[0];

        const stats =
            dashboard.children[1];

        if (title) {
            title.textContent =
                `🎮 メインロビー ${counts.total} / ${capacity}人`;
        }

        if (stats) {
            stats.textContent =
                `🟢 参加中 ${counts.playing} / ${capacity - 1}人　` +
                `👀 観戦 ${counts.watching} / 1人　` +
                `🟡 待機中 ${counts.waiting}人　` +
                `🔄 交代待ち ${counts.exchange}人`;
        }
    }


    // ========================================
    // 既存のダッシュボード描画を拡張
    // ========================================

    function hookLobbyDashboard() {
        if (
            typeof window.renderLobbyDashboard !== "function" ||
            window.renderLobbyDashboard.__ypMainLobbyWrapped
        ) {
            return;
        }

        const original =
            window.renderLobbyDashboard;

        const wrapped =
            function () {
                original.apply(this, arguments);
                updateLobbyDisplay();
            };

        wrapped.__ypMainLobbyWrapped = true;

        window.renderLobbyDashboard =
            wrapped;
    }


    // ========================================
    // 初期化
    // ========================================

    function start() {
        createPanel();

        hookLobbyDashboard();

        loadCapacity();

        /*
         * 既存のrender()で更新されるほか、
         * 見た目の人数表示が残らないよう定期的に更新する。
         */
        setInterval(
            updateLobbyDisplay,
            1500
        );
    }


    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }

})();