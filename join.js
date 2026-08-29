// ========================================
// YP-Manager URL参加ページ v1.3.0
// 待機列参加・チャットのみ利用対応版
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

let currentSessionId =
    null;


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
// 本人確認トークン管理
// ========================================

function getCancelTokenStorageKey(
    participantId
) {

    return (
        "yp_cancel_token_" +
        participantId
    );
}


function saveCancelToken(
    participantId,
    token
) {

    if (
        !participantId ||
        !token
    ) {

        return;
    }


    localStorage.setItem(
        getCancelTokenStorageKey(
            participantId
        ),
        token
    );
}


function getCancelToken(
    participantId
) {

    if (!participantId) {

        return null;
    }


    return localStorage.getItem(
        getCancelTokenStorageKey(
            participantId
        )
    );
}


function removeCancelToken(
    participantId
) {

    if (!participantId) {

        return;
    }


    localStorage.removeItem(
        getCancelTokenStorageKey(
            participantId
        )
    );
}


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
// 現在配信ID取得
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

            currentSessionId =
                null;


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
                    ascending: false
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
// waiting / playing / viewer中の自分を取得
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
                    "playing",
                    "viewer"
                ]
            )
            .order(
                "joined_at",
                {
                    ascending: false
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


    return (
        data &&
        data.length > 0
    )
        ? data[0]
        : null;
}


// ========================================
// 待機順位取得
// ========================================

async function getCurrentPosition(
    entry
) {

    if (
        !currentSessionId ||
        !entry
    ) {

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
                    ascending: true
                }
            );


    if (
        error ||
        !data
    ) {

        console.error(
            "順位取得エラー:",
            error
        );


        return (
            entry.display_order ??
            "-"
        );
    }


    const index =
        data.findIndex(
            person =>
                person.id ===
                entry.id
        );


    if (
        index === -1
    ) {

        return (
            entry.display_order ??
            "-"
        );
    }


    return (
        index + 1
    );
}


// ========================================
// 本人確認トークン確保
// ========================================

async function ensureCancelToken(
    entry
) {

    if (
        !entry ||
        !entry.id
    ) {

        return null;
    }


    const savedToken =
        getCancelToken(
            entry.id
        );


    if (savedToken) {

        return savedToken;
    }


    try {

        if (
            entry.status ===
            "viewer"
        ) {

            const {
                data,
                error
            } =
                await supabaseClient
                    .rpc(
                        "join_chat_viewer",
                        {
                            p_name:
                                entry.name,

                            p_user_id:
                                URL_USER_ID
                        }
                    );


            if (
                error ||
                !data?.access_token
            ) {

                console.error(
                    "チャット本人確認情報取得エラー:",
                    error
                );

                return null;
            }


            saveCancelToken(
                entry.id,
                data.access_token
            );


            return data.access_token;
        }


        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "join_url_queue",
                    {
                        p_name:
                            entry.name,

                        p_user_id:
                            URL_USER_ID
                    }
                );


        if (error) {

            console.error(
                "キャンセルトークン取得エラー:",
                error
            );


            return null;
        }


        if (
            data &&
            data.cancel_token
        ) {

            saveCancelToken(
                entry.id,
                data.cancel_token
            );


            return data.cancel_token;
        }


        return null;

    } catch (error) {

        console.error(
            "キャンセルトークン取得例外:",
            error
        );


        return null;
    }
}


// ========================================
// 待機中UI
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


    viewerButton.disabled =
        true;


    viewerButton.textContent =
        "💬 チャット利用可能";


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


    await ensureCancelToken(
        entry
    );
}


// ========================================
// 参加中UI
// ========================================

function showPlayingState() {

    nameInput.disabled =
        true;


    joinButton.disabled =
        true;


    joinButton.textContent =
        "現在参加中";


    viewerButton.disabled =
        true;


    viewerButton.textContent =
        "💬 チャット利用可能";


    cancelButton.classList.add(
        "hidden"
    );


    showMessage(
        `現在参加中です。<br><br>
        2試合終了後は、
        再参加待機へ自動的に移動します。`,
        "info"
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


    cancelButton.disabled =
        false;


    cancelButton.textContent =
        "参加を辞退する";


    cancelButton.classList.add(
        "hidden"
    );
}


// ========================================
// チャットのみ利用中UI
// ========================================

async function showViewerState(
    entry
) {

    nameInput.disabled =
        true;


    nameInput.value =
        entry.name || "";


    joinButton.disabled =
        false;


    joinButton.textContent =
        "🎮 待機列にも参加する";


    viewerButton.disabled =
        true;


    viewerButton.textContent =
        "💬 チャットのみ利用中";


    cancelButton.classList.add(
        "hidden"
    );


    showMessage(
        `チャットのみ利用中です。<br>
        待機人数や待ち順には含まれません。`,
        "success"
    );


    await ensureCancelToken(
        entry
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
        "現在利用できません";


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
// RPC参加
// ========================================

async function joinQueue() {

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const activeEntry =
        await getMyActiveEntry();


    // チャットのみ利用者を待機列へ移動
    if (
        activeEntry?.status ===
        "viewer"
    ) {

        const accessToken =
            getCancelToken(
                activeEntry.id
            ) ||
            await ensureCancelToken(
                activeEntry
            );


        if (!accessToken) {

            showMessage(
                "本人確認情報を取得できませんでした。",
                "error"
            );

            return;
        }


        joinButton.disabled =
            true;


        joinButton.textContent =
            "待機列へ移動中…";


        try {

            const {
                data,
                error
            } =
                await supabaseClient
                    .rpc(
                        "chat_viewer_join_queue",
                        {
                            p_participant_id:
                                activeEntry.id,

                            p_access_token:
                                accessToken
                        }
                    );


            if (error) {

                throw error;
            }


            if (
                data?.cancel_token &&
                data?.id
            ) {

                saveCancelToken(
                    data.id,
                    data.cancel_token
                );
            }


            if (
                data?.status ===
                "playing"
            ) {

                showPlayingState();

            } else {

                await showWaitingState(
                    data
                );
            }


            await refreshParticipantChatAccess();

        } catch (error) {

            console.error(
                "待機列移動エラー:",
                error
            );


            const errorText =
                String(
                    error?.message ||
                    ""
                );


            if (
                errorText.includes(
                    "再参加受付前"
                )
            ) {

                showMessage(
                    `現在、再参加受付前です。<br>
                    チャットはそのまま利用できます。`,
                    "info"
                );

            } else {

                showMessage(
                    "待機列へ参加できませんでした。",
                    "error"
                );
            }


            joinButton.disabled =
                false;


            joinButton.textContent =
                "🎮 待機列にも参加する";
        }


        return;
    }


    const name =
        nameInput
            .value
            .trim();


    if (
        name === ""
    ) {

        showMessage(
            "名前を入力してください。",
            "error"
        );

        return;
    }


    if (
        name.length > 30
    ) {

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


    try {

        const queueEntry =
            await getMyActiveEntry();


        if (queueEntry) {

            if (
                queueEntry.status ===
                "waiting"
            ) {

                await showWaitingState(
                    queueEntry
                );

            } else if (
                queueEntry.status ===
                "playing"
            ) {

                showPlayingState();

            } else {

                await showViewerState(
                    queueEntry
                );
            }


            return;
        }


        joinButton.textContent =
            "送信中…";


        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "join_url_queue",
                    {
                        p_name:
                            name,

                        p_user_id:
                            URL_USER_ID
                    }
                );


        if (error) {

            throw error;
        }


        if (
            !data ||
            !data.id
        ) {

            throw new Error(
                "参加情報を取得できませんでした。"
            );
        }


        if (
            data.cancel_token
        ) {

            saveCancelToken(
                data.id,
                data.cancel_token
            );
        }


        console.log(
            data.already_active
                ? "既存参加情報取得:"
                : (
                    data.note ===
                    "rejoin"
                        ? "URL再参加成功:"
                        : "URL初参加成功:"
                ),
            data
        );


        nameInput.value =
            "";


        if (
            data.status ===
            "playing"
        ) {

            showPlayingState();

        } else {

            await showWaitingState(
                data
            );
        }

    } catch (error) {

        console.error(
            "参加処理エラー:",
            error
        );


        const errorText =
            String(
                error?.message ||
                ""
            );


        if (
            errorText.includes(
                "再参加受付前"
            )
        ) {

            showMessage(
                `現在、再参加受付前です。<br>
                配信者が再参加受付を開始してから、
                もう一度お申し込みください。`,
                "info"
            );

        } else if (
            errorText.includes(
                "現在受付中の配信"
            )
        ) {

            showNoSessionState();

            return;

        } else {

            showMessage(
                "参加できませんでした。",
                "error"
            );
        }


        showJoinState();
    }
}


// ========================================
// チャットのみ利用開始
// ========================================

async function joinChatViewer() {

    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const activeEntry =
        await getMyActiveEntry();


    if (activeEntry) {

        if (
            activeEntry.status ===
            "waiting"
        ) {

            await showWaitingState(
                activeEntry
            );

        } else if (
            activeEntry.status ===
            "playing"
        ) {

            showPlayingState();

        } else {

            await showViewerState(
                activeEntry
            );
        }


        return;
    }


    const name =
        nameInput
            .value
            .trim();


    if (!name) {

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


    viewerButton.textContent =
        "登録中…";


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "join_chat_viewer",
                    {
                        p_name:
                            name,

                        p_user_id:
                            URL_USER_ID
                    }
                );


        if (
            error ||
            !data?.id
        ) {

            throw (
                error ||
                new Error(
                    "利用者情報を取得できませんでした。"
                )
            );
        }


        if (data.access_token) {

            saveCancelToken(
                data.id,
                data.access_token
            );
        }


        if (
            data.status ===
            "waiting"
        ) {

            await showWaitingState(
                data
            );

        } else if (
            data.status ===
            "playing"
        ) {

            showPlayingState();

        } else {

            await showViewerState(
                data
            );
        }


        await refreshParticipantChatAccess();

    } catch (error) {

        console.error(
            "チャット利用開始エラー:",
            error
        );


        showMessage(
            "チャット利用を開始できませんでした。",
            "error"
        );


        showJoinState();
    }
}


// ========================================
// RPC辞退
// ========================================

async function cancelQueue() {

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


    try {

        let cancelToken =
            getCancelToken(
                entry.id
            );


        if (!cancelToken) {

            cancelToken =
                await ensureCancelToken(
                    entry
                );
        }


        if (!cancelToken) {

            throw new Error(
                "キャンセルトークンを取得できませんでした。"
            );
        }


        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "cancel_url_queue",
                    {
                        p_participant_id:
                            entry.id,

                        p_cancel_token:
                            cancelToken
                    }
                );


        if (error) {

            throw error;
        }


        console.log(
            "URL辞退成功:",
            data
        );


        removeCancelToken(
            entry.id
        );


        showJoinState();


        showMessage(
            `参加を辞退しました。<br>
            また参加したくなったら、
            もう一度受付できます。`,
            "info"
        );

    } catch (error) {

        console.error(
            "辞退エラー:",
            error
        );


        showMessage(
            "辞退処理に失敗しました。",
            "error"
        );


        cancelButton.disabled =
            false;


        cancelButton.textContent =
            "参加を辞退する";
    }
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


    viewerButton.disabled =
        true;


    viewerButton.textContent =
        "確認中…";


    cancelButton.classList.add(
        "hidden"
    );


    showMessage(
        "現在の参加受付を確認しています…",
        ""
    );


    const sessionLoaded =
        await loadCurrentSession();


    if (!sessionLoaded) {

        showNoSessionState();

        return;
    }


    const activeEntry =
        await getMyActiveEntry();


    if (activeEntry) {

        if (
            activeEntry.status ===
            "waiting"
        ) {

            await showWaitingState(
                activeEntry
            );

        } else if (
            activeEntry.status ===
            "playing"
        ) {

            showPlayingState();

        } else {

            await showViewerState(
                activeEntry
            );
        }


        return;
    }


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
    joinChatViewer
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