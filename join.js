// ========================================
// YP-Manager URL参加ページ v1.3.5
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
// ボタン表示補助
// ========================================

function setDefaultButtonStyles() {

    viewerButton.style.backgroundColor =
        "";

    viewerButton.style.color =
        "";

    viewerButton.style.borderColor =
        "";

    viewerButton.style.boxShadow =
        "";
}


function setViewerJoinButtonStyle() {

    viewerButton.style.backgroundColor =
        "#2ecc71";

    viewerButton.style.color =
        "#ffffff";

    viewerButton.style.borderColor =
        "#27ae60";

    viewerButton.style.boxShadow =
        "0 2px 0 #27ae60";
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
// 現在の自分の有効参加状態を取得
// waiting / viewer
// ========================================

async function getMyActiveEntry() {

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
            .in(
                "status",
                [
                    "waiting",
                    "viewer"
                ]
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


// 後方互換用
async function getMyWaitingEntry() {
    return await getMyActiveEntry();
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
// 待機列参加中UI
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


    // 現在は待機列参加中
    joinButton.disabled =
        true;

    joinButton.textContent =
        "🎮 待機列に参加中";


    // 逆の操作を可能にする
    viewerButton.disabled =
        false;

    viewerButton.textContent =
        "💬 チャットのみ利用する";

    setDefaultButtonStyles();


    cancelButton.disabled =
        false;

    cancelButton.textContent =
        "参加を辞退する";

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
// チャットのみ利用中UI
// ========================================

function showViewerState(
    entry
) {

    nameInput.disabled =
        true;


    // 現在は待機列にいない
    joinButton.disabled =
        true;

    joinButton.textContent =
        "🎮 待機列には参加していません";


    // こちらを
    // 「待機列に参加する」ボタンにする
    viewerButton.disabled =
        false;

    viewerButton.textContent =
        "🎮 待機列に参加する";

    setViewerJoinButtonStyle();


    cancelButton.disabled =
        false;

    cancelButton.textContent =
        "チャットのみ利用を終了";

    cancelButton.classList.remove(
        "hidden"
    );


    showMessage(
        `チャットのみ利用中です。<br>
        待機列には参加していません。`,
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
        "🎮 待機列に参加する";


    viewerButton.disabled =
        false;

    viewerButton.textContent =
        "💬 チャットのみ利用する";

    setDefaultButtonStyles();


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


    viewerButton.disabled =
        true;

    viewerButton.textContent =
        "💬 チャットのみ利用する";

    setDefaultButtonStyles();


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
// 待機列に参加する
// ========================================

async function joinQueue() {

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    // 現在の参加状態を先に取得
    // viewerからの再参加では
    // 名前入力を要求しない
    const currentEntry =
        await getMyActiveEntry();


    // ====================================
    // viewer → waiting
    // ====================================

    if (
        currentEntry &&
        currentEntry.status ===
        "viewer"
    ) {

        joinButton.disabled =
            true;

        viewerButton.disabled =
            true;

        viewerButton.textContent =
            "待機列へ移動中…";

        setViewerJoinButtonStyle();


        // 現在の最後尾を取得
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
                .neq(
                    "id",
                    currentEntry.id
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
                "待機順取得エラー:",
                lastError
            );


            showMessage(
                "待機列の順番を取得できませんでした。",
                "error"
            );


            showViewerState(
                currentEntry
            );

            return;
        }


        let nextOrder =
            1;


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


        const {
            error
        } =
            await supabaseClient
                .from(
                    "participants"
                )
                .update({
                    status:
                        "waiting",

                    display_order:
                        nextOrder,

                    note:
                        null
                })
                .eq(
                    "id",
                    currentEntry.id
                )
                .eq(
                    "user_id",
                    URL_USER_ID
                )
                .eq(
                    "session_id",
                    currentSessionId
                );


        if (error) {

            console.error(
                "待機列への切替エラー:",
                error
            );


            showMessage(
                "待機列への参加に切り替えられませんでした。",
                "error"
            );


            showViewerState(
                currentEntry
            );

            return;
        }


        await ensureCancelToken(
            currentEntry
        );


        const updatedEntry = {
            ...currentEntry,

            status:
                "waiting",

            display_order:
                nextOrder,

            note:
                null
        };


        await showWaitingState(
            updatedEntry
        );


        showMessage(
            `待機列に参加しました！<br>
            現在の待ち順は
            <strong>${nextOrder}番</strong>
            です。`,
            "success"
        );


        return;
    }


    // ====================================
    // waiting → waiting
    // ====================================

    if (
        currentEntry &&
        currentEntry.status ===
        "waiting"
    ) {

        await showWaitingState(
            currentEntry
        );

        return;
    }


    // ====================================
    // 新規参加
    // ====================================

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

    viewerButton.disabled =
        true;

    joinButton.textContent =
        "送信中…";


    // ------------------------------------
    // 現在の最後尾を取得
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


    let nextOrder =
        1;


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
    `参加できませんでした。<br>
    code: ${error?.code || "なし"}<br>
    ${error?.message || "原因不明のエラー"}`,
    "error"
);


        showJoinState();

        return;
    }


    console.log(
        "URL参加成功:",
        data
    );


    nameInput.value =
        "";


    if (
        data &&
        data.length > 0
    ) {

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


    const currentEntry =
        await getMyActiveEntry();


    // ====================================
    // viewer → waiting
    // ====================================

    if (
        currentEntry &&
        currentEntry.status ===
        "viewer"
    ) {

        // 「待機列に参加する」は
        // joinQueueと同じ処理
        await joinQueue();

        return;
    }


    // ====================================
    // waiting → viewer
    // ====================================

    if (
        currentEntry &&
        currentEntry.status ===
        "waiting"
    ) {

        const confirmed =
            confirm(
                "待機列への参加をやめて、チャットのみ利用に切り替えますか？"
            );


        if (!confirmed) {
            return;
        }


        viewerButton.disabled =
            true;

        joinButton.disabled =
            true;

        viewerButton.textContent =
            "切替中…";


        const {
            error
        } =
            await supabaseClient
                .from(
                    "participants"
                )
                .update({
                    status:
                        "viewer",

                    display_order:
                        null,

                    note:
                        "viewer"
                })
                .eq(
                    "id",
                    currentEntry.id
                )
                .eq(
                    "user_id",
                    URL_USER_ID
                )
                .eq(
                    "session_id",
                    currentSessionId
                );


        if (error) {

            console.error(
                "チャットのみ利用への切替エラー:",
                error
            );


            showMessage(
                "チャットのみ利用への切り替えに失敗しました。",
                "error"
            );


            await showWaitingState(
                currentEntry
            );

            return;
        }


        await ensureCancelToken(
            currentEntry
        );


        showViewerState(
            {
                ...currentEntry,

                status:
                    "viewer",

                display_order:
                    null,

                note:
                    "viewer"
            }
        );


        showMessage(
            `チャットのみ利用に切り替えました。<br>
            待機列には参加していません。`,
            "success"
        );


        return;
    }


    // ====================================
    // 新規viewer登録
    // ====================================

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
    `チャットのみ利用に登録できませんでした。<br>
    code: ${error?.code || "なし"}<br>
    ${error?.message || "原因不明のエラー"}`,
    "error"
);


        showJoinState();

        return;
    }


    if (
        data &&
        data.length > 0
    ) {

        await ensureCancelToken(
            data[0]
        );


        showViewerState(
            data[0]
        );


        showMessage(
            `チャットのみ利用中です。<br>
            待機列には参加していません。`,
            "success"
        );
    }
}


// ========================================
// 辞退する / チャットのみ利用を終了
// ========================================

async function cancelQueue() {

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const entry =
        await getMyActiveEntry();


    if (!entry) {

        showMessage(
            "現在、参加受付されていません。",
            "info"
        );


        showJoinState();

        return;
    }


    const isViewer =
        entry.status ===
        "viewer";


    const confirmed =
        confirm(
            isViewer
                ? "チャットのみ利用を終了しますか？"
                : "参加を辞退しますか？"
        );


    if (!confirmed) {
        return;
    }


    cancelButton.disabled =
        true;

    cancelButton.textContent =
        isViewer
            ? "終了処理中…"
            : "辞退処理中…";


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


    if (error) {

        console.error(
            isViewer
                ? "チャットのみ利用終了エラー:"
                : "辞退エラー:",
            error
        );


        cancelButton.textContent =
            isViewer
                ? "チャットのみ利用を終了"
                : "参加を辞退する";


        showMessage(
            isViewer
                ? "チャットのみ利用の終了に失敗しました。"
                : "辞退処理に失敗しました。",
            "error"
        );

        return;
    }


    showJoinState();


    showMessage(
        isViewer
            ? "チャットのみ利用を終了しました。"
            : `参加を辞退しました。<br>
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

    viewerButton.disabled =
        true;

    joinButton.textContent =
        "確認中…";

    viewerButton.textContent =
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
    // この端末の有効参加状態
    // waiting / viewer
    // ------------------------------------

    const entry =
        await getMyActiveEntry();


    if (entry) {

        await ensureCancelToken(
            entry
        );


        if (
            entry.status ===
            "viewer"
        ) {

            showViewerState(
                entry
            );

        } else {

            await showWaitingState(
                entry
            );
        }


        return;
    }


    // ------------------------------------
    // 未参加
    // ------------------------------------

    showJoinState();


    showMessage(
        "",
        ""
    );
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