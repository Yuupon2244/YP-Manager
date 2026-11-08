// ============================================================
// YP-Manager 配信画面リモコン
// - guide_current_match_number: 2試合交代制の試合数表示
// - guide_display_config: OBS下部帯の表示モード・表示文言
// - stream_queue_visible: 既存の順番待ちリスト表示設定（別管理）
// participants の状態・試合数・ローテーション処理には触れない。
// ============================================================

(function () {
    "use strict";

    const MATCH_SETTING_KEY = "guide_current_match_number";
    const DISPLAY_CONFIG_KEY = "guide_display_config";
    const DEFAULT_MATCH_NUMBER = 1;

    const DEFAULT_CONFIG = {
        version: 1,
        mode: "two_match",
        brandText: "LIVE",
        titleText: "参加案内(テスト中)",
        normalMessages: [
            "参加型配信中！",
            "参加希望の方はコメントしてね！"
        ],
        customMessages: [
            "初見さんも大歓迎！",
            "参加希望の方はコメントしてね！"
        ]
    };

    const ALLOWED_MODES = [
        "two_match",
        "normal",
        "custom",
        "off"
    ];

    const matchButton = document.getElementById("guideMatchNumberToggle");
    const matchStatus = document.getElementById("guideMatchNumberStatus");
    const modeStatus = document.getElementById("guideDisplayModeStatus");
    const brandInput = document.getElementById("guideBrandText");
    const titleInput = document.getElementById("guideTitleText");
    const normalMessagesInput = document.getElementById("guideNormalMessages");
    const customMessagesInput = document.getElementById("guideCustomMessages");
    const configSaveButton = document.getElementById("guideDisplayConfigSave");
    const configStatus = document.getElementById("guideDisplayConfigStatus");
    const modeButtons = Array.from(
        document.querySelectorAll("[data-guide-mode]")
    );

    let supabaseClientForRemote = null;
    let currentMatchNumber = DEFAULT_MATCH_NUMBER;
    let currentConfig = cloneDefaultConfig();
    let initialized = false;
    let initializing = false;
    let matchBusy = false;
    let configBusy = false;

    function cloneDefaultConfig() {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    function getSupabaseClient() {
        try {
            return typeof supabaseClient !== "undefined"
                ? supabaseClient
                : null;
        } catch (_) {
            return null;
        }
    }

    function cleanText(value, fallback, maxLength) {
        const text = String(value ?? "").trim().slice(0, maxLength);
        return text || fallback;
    }

    function normalizeMessages(value, fallback) {
        const source = Array.isArray(value)
            ? value
            : typeof value === "string"
                ? value.split(/\r?\n/)
                : [];

        const messages = source
            .map(message => String(message ?? "").trim())
            .filter(Boolean)
            .slice(0, 8)
            .map(message => message.slice(0, 100));

        return messages.length > 0
            ? messages
            : [...fallback];
    }

    function normalizeConfig(value) {
        let source = value;

        if (typeof source === "string") {
            try {
                source = JSON.parse(source);
            } catch (_) {
                source = {};
            }
        }

        if (!source || typeof source !== "object" || Array.isArray(source)) {
            source = {};
        }

        const mode = ALLOWED_MODES.includes(source.mode)
            ? source.mode
            : DEFAULT_CONFIG.mode;

        return {
            version: 1,
            mode,
            brandText: cleanText(
                source.brandText,
                DEFAULT_CONFIG.brandText,
                30
            ),
            titleText: cleanText(
                source.titleText,
                DEFAULT_CONFIG.titleText,
                40
            ),
            normalMessages: normalizeMessages(
                source.normalMessages,
                DEFAULT_CONFIG.normalMessages
            ),
            customMessages: normalizeMessages(
                source.customMessages,
                DEFAULT_CONFIG.customMessages
            )
        };
    }

    function parseMatchNumber(value) {
        const number = Number(String(value ?? "").trim());
        return number === 1 || number === 2 ? number : null;
    }

    function setStatus(element, message, color = "#bbb") {
        if (!element) return;
        element.textContent = message;
        element.style.color = color;
    }

    function renderMatchButton(message = "") {
        if (!matchButton) return;

        const nextNumber = currentMatchNumber === 1 ? 2 : 1;
        matchButton.disabled = matchBusy || !initialized;
        matchButton.textContent = `${currentMatchNumber}試合目`;
        matchButton.style.background = currentMatchNumber === 1
            ? "#39b54a"
            : "#3498db";
        matchButton.style.color = "#fff";
        matchButton.setAttribute(
            "aria-label",
            `現在は${currentMatchNumber}試合目。押すと${nextNumber}試合目に切り替えます。`
        );
        matchButton.title = `クリックで${nextNumber}試合目に切り替え`;

        setStatus(
            matchStatus,
            message || `現在：${currentMatchNumber}試合目 ／ クリックで${nextNumber}試合目へ切替`
        );
    }

    function renderModeButtons() {
        modeButtons.forEach(button => {
            const selected = button.dataset.guideMode === currentConfig.mode;
            button.style.background = selected ? "#2878c7" : "#555";
            button.style.outline = selected ? "2px solid #fff" : "none";
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        });

        const labels = {
            two_match: "2試合交代制",
            normal: "通常表示",
            custom: "カスタム表示",
            off: "下部帯を非表示"
        };

        setStatus(
            modeStatus,
            `現在の表示：${labels[currentConfig.mode] || labels.two_match}`
        );
    }

    function fillEditor(config) {
        if (brandInput) brandInput.value = config.brandText;
        if (titleInput) titleInput.value = config.titleText;
        if (normalMessagesInput) {
            normalMessagesInput.value = config.normalMessages.join("\n");
        }
        if (customMessagesInput) {
            customMessagesInput.value = config.customMessages.join("\n");
        }
    }

    function readEditorConfig() {
        return normalizeConfig({
            ...currentConfig,
            brandText: brandInput?.value,
            titleText: titleInput?.value,
            normalMessages: normalMessagesInput?.value,
            customMessages: customMessagesInput?.value
        });
    }

    async function selectSetting(client, key) {
        const { data, error } = await client
            .from("app_settings")
            .select("value")
            .eq("key", key)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    async function readOrCreateMatchNumber(client) {
        let row = await selectSetting(client, MATCH_SETTING_KEY);

        if (!row) {
            const { error } = await client
                .from("app_settings")
                .insert({
                    key: MATCH_SETTING_KEY,
                    value: String(DEFAULT_MATCH_NUMBER),
                    updated_at: new Date().toISOString()
                });

            // ほかの画面が同時に作成した場合は、既存値を読み直す。
            if (error && error.code !== "23505") {
                throw error;
            }

            row = await selectSetting(client, MATCH_SETTING_KEY);
        }

        if (!row) {
            throw new Error("下部帯の試合数設定を取得できませんでした。");
        }

        const number = parseMatchNumber(row.value);
        if (number === null) {
            throw new Error("試合数設定は1または2である必要があります。");
        }

        return number;
    }

    async function loadDisplayConfig(client) {
        const row = await selectSetting(client, DISPLAY_CONFIG_KEY);
        return row ? normalizeConfig(row.value) : cloneDefaultConfig();
    }

    async function saveMatchNumber(nextNumber) {
        const { error } = await supabaseClientForRemote
            .from("app_settings")
            .upsert({
                key: MATCH_SETTING_KEY,
                value: String(nextNumber),
                updated_at: new Date().toISOString()
            }, { onConflict: "key" });

        if (error) throw error;
    }

    async function saveDisplayConfig(nextConfig) {
        const normalized = normalizeConfig(nextConfig);
        const { error } = await supabaseClientForRemote
            .from("app_settings")
            .upsert({
                key: DISPLAY_CONFIG_KEY,
                value: JSON.stringify(normalized),
                updated_at: new Date().toISOString()
            }, { onConflict: "key" });

        if (error) throw error;
        return normalized;
    }

    async function handleMatchToggle() {
        if (matchBusy || !initialized) return;

        matchBusy = true;
        const previous = currentMatchNumber;
        const next = previous === 1 ? 2 : 1;
        renderMatchButton(`${next}試合目を保存中…`);

        try {
            await saveMatchNumber(next);
            currentMatchNumber = next;
            renderMatchButton(`保存しました。現在は${next}試合目表示です。`);
        } catch (error) {
            console.error("[Stream Remote] 試合数の保存エラー:", error);
            setStatus(
                matchStatus,
                "保存できませんでした。通信状態を確認してください。",
                "#ff8b8b"
            );
        } finally {
            matchBusy = false;
            renderMatchButton(matchStatus?.textContent || "");
        }
    }

    async function persistConfig(nextConfig, successMessage) {
        if (configBusy || !initialized) return;

        configBusy = true;
        if (configSaveButton) configSaveButton.disabled = true;
        modeButtons.forEach(button => { button.disabled = true; });
        setStatus(configStatus, "設定を保存中…");
        setStatus(modeStatus, "表示設定を保存中…");

        try {
            currentConfig = await saveDisplayConfig(nextConfig);
            fillEditor(currentConfig);
            renderModeButtons();
            setStatus(
                configStatus,
                successMessage || "保存しました。OBS側には通常2秒以内に反映されます。",
                "#8fe09a"
            );
        } catch (error) {
            console.error("[Stream Remote] 表示設定の保存エラー:", error);
            setStatus(
                configStatus,
                "保存に失敗しました。通信状態やSupabaseの設定を確認してください。",
                "#ff8b8b"
            );
            renderModeButtons();
        } finally {
            configBusy = false;
            if (configSaveButton) configSaveButton.disabled = !initialized;
            modeButtons.forEach(button => { button.disabled = !initialized; });
        }
    }

    async function handleModeClick(event) {
        const button = event.currentTarget;
        const nextMode = button?.dataset?.guideMode;
        if (!ALLOWED_MODES.includes(nextMode)) return;

        const nextConfig = readEditorConfig();
        nextConfig.mode = nextMode;
        await persistConfig(
            nextConfig,
            `${button.textContent.trim()}に切り替えました。OBS側には通常2秒以内に反映されます。`
        );
    }

    async function handleConfigSave() {
        await persistConfig(
            readEditorConfig(),
            "文字設定を保存しました。OBS側には通常2秒以内に反映されます。"
        );
    }

    async function initialize() {
        if (initializing) return;
        initializing = true;

        if (matchButton) {
            matchButton.disabled = true;
            matchButton.textContent = "読み込み中…";
        }
        if (configSaveButton) configSaveButton.disabled = true;
        modeButtons.forEach(button => { button.disabled = true; });
        setStatus(matchStatus, "保存済みの試合数を取得しています…");
        setStatus(modeStatus, "表示設定を取得しています…");

        try {
            supabaseClientForRemote = getSupabaseClient();
            if (!supabaseClientForRemote) {
                throw new Error("YP-ManagerのSupabase接続を取得できません。");
            }

            const [matchNumber, config] = await Promise.all([
                readOrCreateMatchNumber(supabaseClientForRemote),
                loadDisplayConfig(supabaseClientForRemote)
            ]);

            currentMatchNumber = matchNumber;
            currentConfig = config;
            initialized = true;

            fillEditor(currentConfig);
            renderMatchButton();
            renderModeButtons();
            if (configSaveButton) configSaveButton.disabled = false;
            modeButtons.forEach(button => { button.disabled = false; });

            setStatus(
                configStatus,
                "設定を読み込みました。文字を変更したら保存してください。"
            );
        } catch (error) {
            console.error("[Stream Remote] 初期化エラー:", error);
            setStatus(
                matchStatus,
                "設定を読み込めません。通信状態を確認してページを再読み込みしてください。",
                "#ff8b8b"
            );
            setStatus(
                modeStatus,
                "表示設定を読み込めませんでした。",
                "#ff8b8b"
            );
            setStatus(
                configStatus,
                "設定の読み込みに失敗しました。既存の設定値は変更していません。",
                "#ff8b8b"
            );
            if (matchButton) {
                matchButton.disabled = true;
                matchButton.textContent = "読み込み失敗";
            }
        } finally {
            initializing = false;
        }
    }

    if (matchButton) {
        matchButton.addEventListener("click", handleMatchToggle);
    }
    modeButtons.forEach(button => {
        button.addEventListener("click", handleModeClick);
    });
    if (configSaveButton) {
        configSaveButton.addEventListener("click", handleConfigSave);
    }

    initialize();
})();