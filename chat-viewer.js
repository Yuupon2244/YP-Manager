// ========================================
// YP-Manager Owner / Moderator
// 全体共有チャット閲覧 v1.1.0
// ========================================

const sharedChatViewer =
    document.getElementById(
        "sharedChatViewer"
    );

const sharedChatStatus =
    document.getElementById(
        "sharedChatStatus"
    );

const sharedChatList =
    document.getElementById(
        "sharedChatList"
    );

const moderatorChatCompose =
    document.getElementById(
        "moderatorChatCompose"
    );

const moderatorChatInput =
    document.getElementById(
        "moderatorChatInput"
    );

const moderatorChatCount =
    document.getElementById(
        "moderatorChatCount"
    );

const moderatorChatSendButton =
    document.getElementById(
        "moderatorChatSendButton"
    );

const moderatorChatMessage =
    document.getElementById(
        "moderatorChatMessage"
    );


let sharedChatViewerSignature =
    "";

let sharedChatViewerLoading =
    false;

let moderatorChatSending =
    false;


// ========================================
// Supabase取得
// ========================================

function getSharedChatClient() {

    if (
        typeof roomAdminSupabase !==
        "undefined"
    ) {

        return roomAdminSupabase;
    }


    if (
        typeof supabaseClient !==
        "undefined"
    ) {

        return supabaseClient;
    }


    return null;
}


// ========================================
// 現在の配信ID取得
// ========================================

function getSharedChatSessionId() {

    if (
        typeof currentRoom !==
            "undefined" &&
        currentRoom?.session_id
    ) {

        return currentRoom.session_id;
    }


    if (
        typeof currentSessionId !==
            "undefined" &&
        currentSessionId
    ) {

        return currentSessionId;
    }


    return null;
}


// ========================================
// チャット表示可否
// ========================================

function canShowSharedChatViewer() {

    if (
        typeof authReady !==
        "undefined"
    ) {

        return authReady === true;
    }


    return true;
}


// ========================================
// Moderator画面判定
// ========================================

function isModeratorChatPage() {

    return Boolean(

        moderatorChatCompose &&

        moderatorChatInput &&

        moderatorChatSendButton &&

        typeof authReady !==
            "undefined" &&

        authReady === true &&

        typeof currentRoom !==
            "undefined" &&

        currentRoom?.id &&

        currentRoom?.session_id
    );
}


// ========================================
// 時刻表示
// ========================================

function formatSharedChatTime(
    value
) {

    if (!value) {

        return "";
    }


    return new Date(
        value
    ).toLocaleTimeString(
        "ja-JP",
        {
            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );
}


// ========================================
// チャット描画
// ========================================

function renderSharedChatViewer(
    messages
) {

    const signature =
        JSON.stringify(

            messages.map(
                item => [

                    item.message_id,

                    item.sent_at,

                    item.is_deleted,

                    item.can_delete
                ]
            )
        );


    if (
        signature ===
        sharedChatViewerSignature
    ) {

        return;
    }


    sharedChatViewerSignature =
        signature;


    const nearBottom =

        sharedChatList.scrollHeight -

        sharedChatList.scrollTop -

        sharedChatList.clientHeight <

        80;


    sharedChatList.innerHTML =
        "";


    if (
        messages.length === 0
    ) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "shared-chat-empty";


        empty.textContent =
            "まだメッセージはありません";


        sharedChatList.appendChild(
            empty
        );


        return;
    }


    messages.forEach(
        item => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =

                item.sender_type ===
                    "moderator"

                    ? "shared-chat-item shared-chat-item-moderator"

                    : "shared-chat-item";


            const meta =
                document.createElement(
                    "div"
                );


            meta.className =
                "shared-chat-meta";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "shared-chat-name";


            name.textContent =

                item.sender_type ===
                    "moderator"

                    ? `🛡 ${
                        item.participant_name ||
                        "Moderator"
                    }（Moderator）`

                    : (
                        item.participant_name ||
                        "名前不明"
                    );


            const time =
                document.createElement(
                    "div"
                );


            time.className =
                "shared-chat-time";


            time.textContent =
                formatSharedChatTime(
                    item.sent_at
                );


            const text =
                document.createElement(
                    "div"
                );


            text.className =
                "shared-chat-text";


            text.textContent =
                item.message_text ||
                "";


            meta.appendChild(
                name
            );


            meta.appendChild(
                time
            );


            // =================================
            // 削除済みメッセージ
            // =================================

            if (
                item.is_deleted
            ) {

                card.classList.add(
                    "shared-chat-item-deleted"
                );


                const deletedNote =
                    document.createElement(
                        "div"
                    );


                deletedNote.className =
                    "shared-chat-deleted-note";


                deletedNote.textContent =

                    `削除済み${
                        item.deleted_by_name

                            ? `（${item.deleted_by_name}）`

                            : ""
                    }`;


                card.appendChild(
                    meta
                );


                card.appendChild(
                    text
                );


                card.appendChild(
                    deletedNote
                );


                sharedChatList.appendChild(
                    card
                );


                return;
            }


            // =================================
            // 削除ボタン
            // =================================

            if (
                item.can_delete
            ) {

                const deleteButton =
                    document.createElement(
                        "button"
                    );


                deleteButton.type =
                    "button";


                deleteButton.className =
                    "shared-chat-delete-button";


                deleteButton.textContent =
                    "削除";


                deleteButton.onclick =
                    () =>
                        deleteSharedChatMessage(
                            item.message_id
                        );


                meta.appendChild(
                    deleteButton
                );
            }


            card.appendChild(
                meta
            );


            card.appendChild(
                text
            );


            sharedChatList.appendChild(
                card
            );
        }
    );


    if (
        nearBottom ||

        sharedChatList.scrollTop ===
            0
    ) {

        sharedChatList.scrollTop =
            sharedChatList.scrollHeight;
    }
}


// ========================================
// Owner・Moderatorのメッセージ削除
// ========================================

async function deleteSharedChatMessage(
    messageId
) {

    const confirmed =
        confirm(
            "このメッセージを削除しますか？"
        );


    if (!confirmed) {

        return;
    }


    try {

        const client =
            getSharedChatClient();


        if (!client) {

            throw new Error(
                "接続情報を確認できませんでした。"
            );
        }


        const rpcName =
            isModeratorChatPage()

                ? "moderator_delete_own_message"

                : "owner_delete_participant_message";


        const {
            error
        } =
            await client.rpc(
                rpcName,
                {
                    p_message_id:
                        messageId
                }
            );


        if (error) {

            throw error;
        }


        sharedChatViewerSignature =
            "";


        await loadSharedChatViewer();

    } catch (error) {

        console.error(
            "チャット削除エラー:",
            error
        );


        alert(
            error?.message ||
            "削除できませんでした。"
        );
    }
}


// ========================================
// チャット取得
// ========================================

async function loadSharedChatViewer() {

    if (
        sharedChatViewerLoading ||

        !sharedChatViewer ||

        !sharedChatStatus ||

        !sharedChatList
    ) {

        return;
    }


    if (
        !canShowSharedChatViewer()
    ) {

        return;
    }


    if (
        moderatorChatCompose
    ) {

        moderatorChatCompose
            .classList
            .toggle(

                "hidden",

                !isModeratorChatPage()
            );
    }


    const client =
        getSharedChatClient();


    const sessionId =
        getSharedChatSessionId();


    if (
        !client ||
        !sessionId
    ) {

        sharedChatStatus.textContent =
            "現在の配信チャットはありません";


        return;
    }


    sharedChatViewerLoading =
        true;


    try {

        const {
            data,
            error
        } =
            await client.rpc(

                "get_participant_messages",

                {
                    p_session_id:
                        sessionId
                }
            );


        if (error) {

            throw error;
        }


        const messages =
            Array.isArray(
                data
            )
                ? data
                : [];


        sharedChatStatus.textContent =
            `共有メッセージ ${messages.length}件`;


        renderSharedChatViewer(
            messages
        );

    } catch (error) {

        console.error(
            "共有チャット取得エラー:",
            error
        );


        sharedChatStatus.textContent =
            "チャットを取得できませんでした";

    } finally {

        sharedChatViewerLoading =
            false;
    }
}


// ========================================
// Moderator送信結果
// ========================================

function setModeratorChatFeedback(
    text,
    isError = false
) {

    if (
        !moderatorChatMessage
    ) {

        return;
    }


    moderatorChatMessage.textContent =
        text;


    moderatorChatMessage
        .classList
        .toggle(
            "error",
            isError
        );
}


// ========================================
// Moderatorメッセージ送信
// ========================================

async function sendModeratorChatMessage() {

    if (
        moderatorChatSending ||

        !isModeratorChatPage()
    ) {

        return;
    }


    const messageText =
        moderatorChatInput
            .value
            .trim();


    if (!messageText) {

        setModeratorChatFeedback(
            "メッセージを入力してください。",
            true
        );


        return;
    }


    if (
        messageText.length >
        100
    ) {

        setModeratorChatFeedback(
            "100文字以内で入力してください。",
            true
        );


        return;
    }


    moderatorChatSending =
        true;


    moderatorChatInput.disabled =
        true;


    moderatorChatSendButton.disabled =
        true;


    moderatorChatSendButton.textContent =
        "送信中…";


    setModeratorChatFeedback(
        ""
    );


    try {

        const client =
            getSharedChatClient();


        const {
            error
        } =
            await client.rpc(

                "send_moderator_message",

                {
                    p_session_id:
                        currentRoom.session_id,

                    p_room_id:
                        currentRoom.id,

                    p_message:
                        messageText
                }
            );


        if (error) {

            throw error;
        }


        moderatorChatInput.value =
            "";


        if (
            moderatorChatCount
        ) {

            moderatorChatCount.textContent =
                "0 / 100";
        }


        setModeratorChatFeedback(
            "送信しました。5秒後に次を送れます。"
        );


        await loadSharedChatViewer();


        setTimeout(
            () => {

                setModeratorChatFeedback(
                    ""
                );
            },
            5000
        );

    } catch (error) {

        console.error(
            "Moderatorチャット送信エラー:",
            error
        );


        setModeratorChatFeedback(

            error?.message ||

            "送信できませんでした。",

            true
        );

    } finally {

        moderatorChatSending =
            false;


        moderatorChatInput.disabled =
            false;


        moderatorChatSendButton.disabled =
            false;


        moderatorChatSendButton.textContent =
            "送信";


        moderatorChatInput.focus();
    }
}


// ========================================
// Moderator入力イベント
// ========================================

if (
    moderatorChatInput &&
    moderatorChatSendButton
) {

    moderatorChatInput
        .addEventListener(

            "input",

            () => {

                if (
                    moderatorChatCount
                ) {

                    moderatorChatCount.textContent =

                        `${
                            moderatorChatInput
                                .value
                                .length
                        } / 100`;
                }
            }
        );


    moderatorChatInput
        .addEventListener(

            "keydown",

            event => {

                if (
                    event.key ===
                        "Enter" &&

                    !event.shiftKey
                ) {

                    event.preventDefault();


                    sendModeratorChatMessage();
                }
            }
        );


    moderatorChatSendButton
        .addEventListener(

            "click",

            sendModeratorChatMessage
        );
}


// ========================================
// 初回取得・定期更新
// ========================================

setTimeout(
    loadSharedChatViewer,
    1000
);


setInterval(

    async () => {

        if (
            document.hidden
        ) {

            return;
        }


        await loadSharedChatViewer();
    },

    3000
);