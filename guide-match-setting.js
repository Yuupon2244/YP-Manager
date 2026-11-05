// ========================================
// YP-Manager 下部帯の試合数表示設定
// participants の試合数・状態とは完全に独立
// app_settings.key = guide_current_match_number
// app_settings.value = "1" | "2"
// ========================================

(function () {
    "use strict";

    const SETTING_KEY = "guide_current_match_number";
    const DEFAULT_NUMBER = 1;

    const button =
        document.getElementById("guideMatchNumberToggle");

    const status =
        document.getElementById("guideMatchNumberStatus");

    if (!button || !status) {
        console.warn(
            "[Guide Match] 操作UIが見つかりません。"
        );
        return;
    }

    let currentNumber = DEFAULT_NUMBER;
    let initialized = false;
    let busy = false;


    // ========================================
    // 既存Supabase接続を再利用
    // ========================================

    function getSupabaseClient() {

        try {
            return typeof supabaseClient !== "undefined"
                ? supabaseClient
                : null;
        } catch (_) {
            return null;
        }

    }


    // ========================================
    // 設定値の正規化
    // ========================================

    function parseMatchNumber(value) {

        const number =
            Number(String(value ?? "").trim());

        return number === 2
            ? 2
            : number === 1
                ? 1
                : null;

    }


    // ========================================
    // ボタン表示
    // ========================================

    function render(message = "") {

        const nextNumber =
            currentNumber === 1
                ? 2
                : 1;

        button.textContent =
            `${currentNumber}試合目`;

        button.style.background =
            currentNumber === 1
                ? "#39b54a"
                : "#3498db";

        button.setAttribute(
            "aria-label",
            `現在は${currentNumber}試合目。押すと${nextNumber}試合目に切り替えます。`
        );

        button.title =
            `クリックで${nextNumber}試合目に切り替え`;

        if (message) {

            status.textContent =
                message;

        } else {

            status.textContent =
                `現在：${currentNumber}試合目 ／ クリックで${nextNumber}試合目へ切替`;

        }

    }


    // ========================================
    // Supabaseから設定を取得
    // ========================================

    async function selectSetting(client) {

        const {
            data,
            error
        } = await client
            .from("app_settings")
            .select("value")
            .eq("key", SETTING_KEY)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data;

    }


    // ========================================
    // 初期値がなければ1を作成
    // ========================================

    async function readOrCreateSetting(client) {

        let row =
            await selectSetting(client);

        if (!row) {

            const {
                error: insertError
            } = await client
                .from("app_settings")
                .insert({
                    key: SETTING_KEY,
                    value: String(DEFAULT_NUMBER),
                    updated_at: new Date().toISOString()
                });

            // 別タブが同時に作成していた場合は再読込する。
            if (
                insertError &&
                insertError.code !== "23505"
            ) {
                throw insertError;
            }

            row =
                await selectSetting(client);

        }

        if (!row) {

            throw new Error(
                "下部帯の試合数設定を作成・取得できませんでした。"
            );

        }

        const parsed =
            parseMatchNumber(row.value);

        if (parsed === null) {

            throw new Error(
                `設定値が不正です（${String(row.value)}）。1 または 2 が必要です。`
            );

        }

        return parsed;

    }


    // ========================================
    // 設定読み込み
    // ========================================

    async function loadSetting() {

        const client =
            getSupabaseClient();

        if (!client) {

            throw new Error(
                "既存のSupabase接続を取得できません。"
            );

        }

        currentNumber =
            await readOrCreateSetting(client);

        initialized = true;

        button.disabled = false;

        render();

    }


    // ========================================
    // 設定保存
    // ========================================

    async function saveSetting(nextNumber) {

        const client =
            getSupabaseClient();

        if (!client) {

            throw new Error(
                "既存のSupabase接続を取得できません。"
            );

        }

        const {
            error
        } = await client
            .from("app_settings")
            .upsert(
                {
                    key: SETTING_KEY,
                    value: String(nextNumber),
                    updated_at: new Date().toISOString()
                },
                {
                    onConflict: "key"
                }
            );

        if (error) {
            throw error;
        }

    }


    // ========================================
    // 1 ⇄ 2 切り替え
    // ========================================

    async function handleToggle() {

        if (busy) {
            return;
        }

        if (!initialized) {

            await initialize();

            return;

        }

        busy = true;

        button.disabled = true;

        const previousNumber =
            currentNumber;

        const nextNumber =
            previousNumber === 1
                ? 2
                : 1;

        status.textContent =
            `${nextNumber}試合目を保存中…`;

        try {

            await saveSetting(nextNumber);

            currentNumber =
                nextNumber;

            render(
                `保存しました。現在は${currentNumber}試合目表示です。`
            );

        } catch (error) {

            console.error(
                "[Guide Match] 設定保存エラー:",
                error
            );

            // 通信切断時に保存結果が不明な場合、DBの値を再確認する。
            try {

                const client =
                    getSupabaseClient();

                const row =
                    await selectSetting(client);

                const actual =
                    parseMatchNumber(row?.value);

                if (actual !== null) {
                    currentNumber = actual;
                }

            } catch (readError) {

                console.warn(
                    "[Guide Match] 保存後の再確認にも失敗:",
                    readError
                );

            }

            render(
                "保存を確認できませんでした。通信を確認して、もう一度操作してください。"
            );

        } finally {

            busy = false;

            button.disabled =
                !initialized;

        }

    }


    // ========================================
    // 初期化
    // ========================================

    async function initialize() {

        if (busy) {
            return;
        }

        busy = true;

        button.disabled = true;

        button.textContent =
            "読み込み中…";

        status.textContent =
            "保存済みの試合数表示を取得しています…";

        try {

            await loadSetting();

        } catch (error) {

            console.error(
                "[Guide Match] 初期読み込みエラー:",
                error
            );

            initialized = false;

            button.disabled = false;

            button.textContent =
                "再読み込み";

            button.style.background =
                "#555";

            status.textContent =
                "設定を取得できません。押すと再読み込みします。";

        } finally {

            busy = false;

        }

    }


    // ========================================
    // イベント登録
    // ========================================

    button.addEventListener(
        "click",
        handleToggle
    );

    initialize();

})();