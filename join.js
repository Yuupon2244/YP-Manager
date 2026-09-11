// ========================================
// YP-Manager URL参加ページ v0.6.0
// ========================================


// ========================================
// Supabase接続
// ========================================

const SUPABASE_URL =
    "https://ilmiebokwfccybrtduxy.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_tl-vkXmtiYn_f1VtPy689A_dwKCdYg5";


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// ========================================
// 現在の配信ID
// ========================================

let currentSessionId = null;


// ========================================
// HTML要素
// ========================================

const nameInput =
    document.getElementById(
        "nameInput"
    );

const joinButton =
    document.getElementById(
        "joinButton"
    );

const viewerButton =
    document.getElementById(
        "viewerButton"
    );

const cancelButton =
    document.getElementById(
        "cancelButton"
    );

const message =
    document.getElementById(
        "message"
    );


// ========================================
// URL参加者専用ID
// ========================================

function getUrlUserId() {
    let userId =
        localStorage.getItem(
            "yp_url_user_id"
        );


    if (!userId) {
        userId =
            "url-" +
            crypto.randomUUID();

        localStorage.setItem(
            "yp_url_user_id",
            userId
        );
    }


    return userId;
}


const URL_USER_ID =
    getUrlUserId();


// ========================================
// メッセージ表示
// ========================================

function showMessage(
    text,
    type = ""
) {
    message.className =
        type;

    message.innerHTML =
        text;
}


// ========================================
// チャット本人確認token
// ========================================

function getCancelToken(
    participantId
) {
    if (!participantId) {
        return null;
    }

    const key =
        `yp_participant_cancel_token_${participantId}`;

    return localStorage.getItem(
        key
    );
}


async function ensureCancelToken(
    entry
) {
    if (
        !entry ||
        !entry.id
    ) {
        return null;
    }

    const existing =
        getCancelToken(
            entry.id
        );

    if (existing) {
        return existing;
    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "get_or_create_participant_cancel_token",
            {
                p_participant_id:
                    entry.id,

                p_user_id:
                    URL_USER_ID
            }
        );


    if (error) {
        console.error(
            "本人確認token取得エラー:",
            error
        );

        return null;
    }


    const token =
        typeof data === "string"
            ? data
            : data?.cancel_token ||
              data?.token ||
              null;


    if (!token) {
        console.error(
            "本人確認tokenが返されませんでした。",
            data
        );

        return null;
    }


    localStorage.setItem(
        `yp_participant_cancel_token_${entry.id}`,
        token
    );


    return token;
}


// ========================================
// 現在の配信IDをSupabaseから取得
// ========================================

async function loadCurrentSession() {
    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    "app_settings"
                )
                .select(
                    "value"
                )
                .eq(
                    "key",
                    "current_session_id"
                )
                .maybeSingle();


        if (error) {
            console.error(
                "現在配信取得エラー:",
                error
            );

            return false;
        }


        if (
            !data ||
            !data.value
        ) {
            console.warn(
                "現在の配信IDがありません"
            );

            return false;
        }


        currentSessionId =
            String(
                data.value
            ).trim();


        console.log(
            "現在の配信ID:",
            currentSessionId
        );


        return true;

    } catch (error) {

        console.error(
            "現在配信取得例外:",
            error
        );

        return false;
    }
}


// ========================================
// 待機中の自分を取得
// ========================================

async function getMyWaitingEntry() {

    if (!currentSessionId) {
        return null;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .select("*")
            .eq(
                "user_id",
                URL_USER_ID
            )
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "status",
                "waiting"
            )
            .order(
                "joined_at",
                {
                    ascending:false
                }
            )
            .limit(1);


    if (error) {
        console.error(
            "参加状態確認エラー:",
            error
        );

        return null;
    }


    if (
        !data ||
        data.length === 0
    ) {
        return null;
    }


    return data[0];
}


// ========================================
// 現在の実際の待ち順位
// ========================================

async function getCurrentPosition(
    entry
) {

    if (!currentSessionId) {
        return null;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .select(
                "id, display_order"
            )
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "status",
                "waiting"
            )
            .order(
                "display_order",
                {
                    ascending:true
                }
            );


    if (
        error ||
        !data
    ) {
        return entry.display_order;
    }


    const index =
        data.findIndex(
            person =>
                person.id ===
                entry.id
        );


    if (index === -1) {
        return entry.display_order;
    }


    return index + 1;
}


// ========================================
// 参加中UI
// ========================================

async function showWaitingState(
    entry
) {

    const position =
        await getCurrentPosition(
            entry
        );


    nameInput.disabled =
        true;

    joinButton.disabled =
        true;

    joinButton.textContent =
        "参加受付済み";


    cancelButton.classList.remove(
        "hidden"
    );


    showMessage(
        `参加受付済みです！<br><br>
        現在の待ち順は
        <strong>${position}番</strong>
        です。`,
        "success"
    );
}


// ========================================
// 未参加UI
// ========================================

function showJoinState() {

    nameInput.disabled =
        false;

    joinButton.disabled =
        false;

    joinButton.textContent =
        "参加する";


    cancelButton.disabled =
        false;

    cancelButton.textContent =
        "参加を辞退する";


    cancelButton.classList.add(
        "hidden"
    );
}


// ========================================
// 配信なしUI
// ========================================

function showNoSessionState() {

    nameInput.disabled =
        true;

    joinButton.disabled =
        true;

    joinButton.textContent =
        "現在受付していません";


    cancelButton.classList.add(
        "hidden"
    );


    showMessage(
        `現在、参加受付中の配信を
        確認できませんでした。<br>
        配信開始後にページを
        再読み込みしてください。`,
        "info"
    );
}


// ========================================
// 参加する
// ========================================

async function joinQueue() {

    // ------------------------------------
    // 念のため最新sessionを取得
    // ------------------------------------

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const name =
        nameInput.value.trim();


    if (name === "") {

        showMessage(
            "名前を入力してください。",
            "error"
        );

        return;
    }


    if (name.length > 30) {

        showMessage(
            "名前は30文字以内にしてください。",
            "error"
        );

        return;
    }


    joinButton.disabled =
        true;

    joinButton.textContent =
        "確認中…";


    // ------------------------------------
    // 二重参加チェック
    // ------------------------------------

    const existing =
        await getMyWaitingEntry();


    if (existing) {

        await showWaitingState(
            existing
        );

        return;
    }


    joinButton.textContent =
        "送信中…";


    // ------------------------------------
    // 現在の最後尾を取得
    // YouTube・URL共通
    // ------------------------------------

    const {
        data: lastData,
        error: lastError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .select(
                "display_order"
            )
            .eq(
                "session_id",
                currentSessionId
            )
            .order(
                "display_order",
                {
                    ascending:false,
                    nullsFirst:false
                }
            )
            .limit(1);


    if (lastError) {

        console.error(
            "順番取得エラー:",
            lastError
        );


        showMessage(
            "待機列を確認できませんでした。",
            "error"
        );


        showJoinState();

        return;
    }


    let nextOrder = 1;


    if (
        lastData &&
        lastData.length > 0 &&
        Number.isFinite(
            Number(
                lastData[0]
                    .display_order
            )
        )
    ) {

        nextOrder =
            Number(
                lastData[0]
                    .display_order
            ) + 1;
    }


    // ------------------------------------
    // Supabase追加
    // ------------------------------------

    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .insert([
                {
                    name:
                        name,

                    status:
                        "waiting",

                    source:
                        "url",

                    user_id:
                        URL_USER_ID,

                    display_order:
                        nextOrder,

                    note:
                        null,

                    session_id:
                        currentSessionId
                }
            ])
            .select();


    if (error) {

        console.error(
            "参加エラー:",
            error
        );


        showMessage(
            "参加できませんでした。",
            "error"
        );


        showJoinState();

        return;
    }


    console.log(
        "URL参加成功:",
        data
    );


    console.log(
        "使用した配信ID:",
        currentSessionId
    );


    nameInput.value =
        "";


    if (
        data &&
        data.length > 0
    ) {

        // --------------------------------
        // チャット用本人確認tokenを準備
        // --------------------------------

        await ensureCancelToken(
            data[0]
        );


        await showWaitingState(
            data[0]
        );
    }
}

// ========================================
// チャットのみ利用する
// ========================================

async function joinAsViewer() {
    const sessionLoaded =
        await loadCurrentSession();

    if (!sessionLoaded) {
        showNoSessionState();
        return;
    }

    const name =
        nameInput.value.trim();

    if (name === "") {
        showMessage(
            "名前を入力してください。",
            "error"
        );
        return;
    }

    if (name.length > 30) {
        showMessage(
            "名前は30文字以内にしてください。",
            "error"
        );
        return;
    }

    viewerButton.disabled =
        true;

    joinButton.disabled =
        true;

    viewerButton.textContent =
        "登録中…";

    const existing =
        await supabaseClient
            .from("participants")
            .select("*")
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "user_id",
                URL_USER_ID
            )
            .eq(
                "status",
                "viewer"
            )
            .order(
                "joined_at",
                {
                    ascending: false
                }
            )
            .limit(1);

    if (
        existing.error
    ) {
        console.error(
            "チャットのみ利用者確認エラー:",
            existing.error
        );

        showMessage(
            "現在の参加状態を確認できませんでした。",
            "error"
        );

        viewerButton.disabled =
            false;

        joinButton.disabled =
            false;

        viewerButton.textContent =
            "チャットのみ利用する";

        return;
    }

    if (
        existing.data &&
        existing.data.length > 0
    ) {
        await ensureCancelToken(
            existing.data[0]
        );

        showMessage(
            "チャットのみ利用中です。",
            "success"
        );

        viewerButton.disabled =
            true;

        viewerButton.textContent =
            "チャットのみ利用中";

        joinButton.disabled =
            true;

        nameInput.disabled =
            true;

        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("participants")
            .insert([
                {
                    name:
                        name,

                    status:
                        "viewer",

                    source:
                        "url",

                    user_id:
                        URL_USER_ID,

                    display_order:
                        null,

                    note:
                        "viewer",

                    session_id:
                        currentSessionId
                }
            ])
            .select();

    if (error) {
        console.error(
            "チャットのみ利用登録エラー:",
            error
        );

        showMessage(
            "チャットのみ利用に登録できませんでした。",
            "error"
        );

        viewerButton.disabled =
            false;

        joinButton.disabled =
            false;

        viewerButton.textContent =
            "チャットのみ利用する";

        return;
    }

    if (
        data &&
        data.length > 0
    ) {
        await ensureCancelToken(
            data[0]
        );
    }

    nameInput.disabled =
        true;

    joinButton.disabled =
        true;

    joinButton.textContent =
        "待機列には参加していません";

    viewerButton.disabled =
        true;

    viewerButton.textContent =
        "チャットのみ利用中";

    showMessage(
        `チャットのみ利用中です。<br>
        待機列には入りません。`,
        "success"
    );
}


// ========================================
// 辞退する
// ========================================

async function cancelQueue() {

    // 最新の配信IDを取得

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const entry =
        await getMyWaitingEntry();


    if (!entry) {

        showMessage(
            "現在、参加受付されていません。",
            "info"
        );


        showJoinState();

        return;
    }


    const confirmed =
        confirm(
            "参加を辞退しますか？"
        );


    if (!confirmed) {
        return;
    }


    cancelButton.disabled =
        true;

    cancelButton.textContent =
        "辞退処理中…";


    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                status:
                    "cancelled"
            })
            .eq(
                "id",
                entry.id
            )
            .eq(
                "user_id",
                URL_USER_ID
            )
            .eq(
                "session_id",
                currentSessionId
            );


    cancelButton.disabled =
        false;

    cancelButton.textContent =
        "参加を辞退する";


    if (error) {

        console.error(
            "辞退エラー:",
            error
        );


        showMessage(
            "辞退処理に失敗しました。",
            "error"
        );

        return;
    }


    showJoinState();


    showMessage(
        `参加を辞退しました。<br>
        また参加したくなったら、
        もう一度受付できます。`,
        "info"
    );
}


// ========================================
// ページを開いた時
// ========================================

async function initialize() {

    nameInput.disabled =
        true;

    joinButton.disabled =
        true;

    joinButton.textContent =
        "確認中…";


    showMessage(
        "現在の参加受付を確認しています…",
        ""
    );


    // ------------------------------------
    // app_settingsから現在配信取得
    // ------------------------------------

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    // ------------------------------------
    // この端末が既に参加しているか
    // ------------------------------------

    const entry =
        await getMyWaitingEntry();


    if (entry) {

        // 既存参加者でもtokenを準備
        await ensureCancelToken(
            entry
        );


        await showWaitingState(
            entry
        );

    } else {

        showJoinState();

        showMessage(
            "",
            ""
        );
    }
}


// ========================================
// イベント
// ========================================

joinButton.addEventListener(
    "click",
    joinQueue
);

viewerButton.addEventListener(
    "click",
    joinAsViewer
);


cancelButton.addEventListener(
    "click",
    cancelQueue
);


nameInput.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();


            if (
                !joinButton.disabled
            ) {

                joinQueue();
            }
        }
    }
);


// ========================================
// 起動
// ========================================

initialize();