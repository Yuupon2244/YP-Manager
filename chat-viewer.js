// ========================================
// YP-Manager Owner / Moderator
// 全体共有チャット閲覧・送信 v1.3.2
// 画像表示・削除反映・Owner/部屋主強調対応版
// ========================================

const sharedChatViewer =
    document.getElementById("sharedChatViewer");

const sharedChatStatus =
    document.getElementById("sharedChatStatus");

const sharedChatList =
    document.getElementById("sharedChatList");

const moderatorChatCompose =
    document.getElementById("moderatorChatCompose");

const moderatorChatInput =
    document.getElementById("moderatorChatInput");

const moderatorChatCount =
    document.getElementById("moderatorChatCount");

const moderatorChatSendButton =
    document.getElementById("moderatorChatSendButton");

const moderatorChatMessage =
    document.getElementById("moderatorChatMessage");

let sharedChatViewerSignature = "";
let sharedChatViewerLoading = false;

let moderatorChatSending = false;

let ownerChatSending = false;

let ownerChatCompose = null;
let ownerChatInput = null;
let ownerChatCount = null;
let ownerChatSendButton = null;
let ownerChatMessage = null;

// 現在の配信に存在する待機部屋管理者名
let sharedChatRoomModeratorNames = new Set();


// ========================================
// Supabaseクライアント
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
// セッションID
// ========================================

function getSharedChatSessionId() {

    if (
        typeof currentRoom !== "undefined" &&
        currentRoom?.session_id
    ) {
        return currentRoom.session_id;
    }

    if (
        typeof currentSessionId !== "undefined" &&
        currentSessionId
    ) {
        return currentSessionId;
    }

    return null;
}


// ========================================
// 閲覧権限
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

    return (
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
// Owner画面判定
// ========================================

function isOwnerChatPage() {

    return (
        typeof ypAdminProfile !==
            "undefined" &&
        ypAdminProfile?.role ===
            "owner" &&
        !isModeratorChatPage()
    );
}


// ========================================
// 文字列正規化
// ========================================

function normalizeChatName(
    value
) {

    return String(
        value || ""
    ).trim();
}


// ========================================
// 部屋管理者名取得
// ========================================

async function loadSharedChatRoomModerators(
    client,
    sessionId
) {

    sharedChatRoomModeratorNames =
        new Set();

    if (
        !client ||
        !sessionId
    ) {
        return;
    }

    try {

        const {
            data,
            error
        } =
            await client
                .from("rooms")
                .select(
                    "id,moderator_name,is_active"
                )
                .eq(
                    "session_id",
                    sessionId
                )
                .eq(
                    "is_active",
                    true
                );

        if (
            error
        ) {
            console.warn(
                "待機部屋管理者取得エラー:",
                error
            );

            return;
        }

        if (
            Array.isArray(data)
        ) {

            data.forEach(
                room => {

                    const name =
                        normalizeChatName(
                            room?.moderator_name
                        );

                    if (
                        name
                    ) {
                        sharedChatRoomModeratorNames.add(
                            name
                        );
                    }
                }
            );
        }

    } catch (
        error
    ) {

        console.warn(
            "待機部屋管理者取得エラー:",
            error
        );
    }
}


// ========================================
// 部屋管理者判定
// ========================================

function isRoomModeratorName(
    name
) {

    const normalized =
        normalizeChatName(
            name
        );

    if (
        !normalized
    ) {
        return false;
    }

    if (
        sharedChatRoomModeratorNames.has(
            normalized
        )
    ) {
        return true;
    }

    if (
        typeof currentRoom !==
            "undefined" &&
        currentRoom?.moderator_name
    ) {

        return (
            normalizeChatName(
                currentRoom.moderator_name
            ) ===
            normalized
        );
    }

    return false;
}


// ========================================
// Ownerチャット欄
// ========================================

function ensureOwnerChatCompose() {

    if (
        ownerChatCompose ||
        !sharedChatViewer ||
        !sharedChatList ||
        !isOwnerChatPage()
    ) {
        return;
    }

    ownerChatCompose =
        document.createElement(
            "div"
        );

    ownerChatCompose.className =
        "shared-chat-compose";


    ownerChatInput =
        document.createElement(
            "textarea"
        );

    ownerChatInput.maxLength =
        100;

    ownerChatInput.rows =
        2;

    ownerChatInput.placeholder =
        "Ownerとしてメッセージを入力（100文字まで）";


    const bottom =
        document.createElement(
            "div"
        );

    bottom.className =
        "shared-chat-compose-bottom";


    ownerChatCount =
        document.createElement(
            "span"
        );

    ownerChatCount.textContent =
        "0 / 100";

    ownerChatCount.style.color =
        "#aaaaaa";

    ownerChatCount.style.fontSize =
        "12px";


    ownerChatSendButton =
        document.createElement(
            "button"
        );

    ownerChatSendButton.type =
        "button";

    ownerChatSendButton.className =
        "shared-chat-send-button";

    ownerChatSendButton.textContent =
        "Owner送信";


    ownerChatMessage =
        document.createElement(
            "div"
        );

    ownerChatMessage.className =
        "shared-chat-feedback";


    bottom.appendChild(
        ownerChatCount
    );

    bottom.appendChild(
        ownerChatSendButton
    );

    ownerChatCompose.appendChild(
        ownerChatInput
    );

    ownerChatCompose.appendChild(
        bottom
    );

    ownerChatCompose.appendChild(
        ownerChatMessage
    );


    sharedChatViewer.appendChild(
        ownerChatCompose
    );


    // Owner・部屋主の強調CSS
    const style =
        document.createElement(
            "style"
        );

    style.textContent = `
        .shared-chat-item-owner {
            background: #49385f;
            border: 1px solid #b27be5;
        }

        .shared-chat-item-owner .shared-chat-name {
            color: #ffd76a;
        }

        .shared-chat-item-room-admin {
            background: #304b5c;
            border: 1px solid #68b7df;
        }

        .shared-chat-item-room-admin .shared-chat-name {
            color: #8fe3ff;
        }

        .shared-chat-item-deleted {
            opacity: 0.82;
        }

        .shared-chat-deleted-note {
            margin-top: 4px;
            color: #aaaaaa;
            font-size: 12px;
        }

        .shared-chat-delete-button {
            flex-shrink: 0;
            margin-left: auto;
            padding: 8px 12px;
            border: none;
            border-radius: 8px;
            background: #eeeeee;
            color: #222222;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
        }
    `;

    document.head.appendChild(
        style
    );


    ownerChatInput.addEventListener(
        "input",
        () => {

            ownerChatCount.textContent =
                `${ownerChatInput.value.length} / 100`;
        }
    );


    ownerChatInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendOwnerChatMessage();
            }
        }
    );


    ownerChatSendButton.addEventListener(
        "click",
        sendOwnerChatMessage
    );
}


// ========================================
// 時刻
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
// 画像拡大
// ========================================

function openSharedChatImage(
    imageUrl
) {

    if (!imageUrl) {
        return;
    }


    const overlay =
        document.createElement(
            "div"
        );

    overlay.className =
        "shared-chat-image-modal";


    const closeButton =
        document.createElement(
            "button"
        );

    closeButton.type =
        "button";

    closeButton.className =
        "shared-chat-image-modal-close";

    closeButton.textContent =
        "×";

    closeButton.setAttribute(
        "aria-label",
        "閉じる"
    );


    const image =
        document.createElement(
            "img"
        );

    image.src =
        imageUrl;

    image.alt =
        "チャット画像";

    image.className =
        "shared-chat-image-modal-image";


    overlay.appendChild(
        closeButton
    );

    overlay.appendChild(
        image
    );

    document.body.appendChild(
        overlay
    );


    const close =
        () => {
            overlay.remove();
        };


    closeButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            close();
        }
    );


    overlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                overlay
            ) {

                close();
            }
        }
    );


    image.addEventListener(
        "click",
        event => {

            event.stopPropagation();
        }
    );


    const handleEscape =
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                close();

                document.removeEventListener(
                    "keydown",
                    handleEscape
                );
            }
        };


    document.addEventListener(
        "keydown",
        handleEscape
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
                    item.deleted_at,
                    item.can_delete,
                    item.message_text ||
                        "",
                    item.image_url ||
                        "",
                    item.image_path ||
                        ""
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
        messages.length ===
        0
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

            const senderName =
                normalizeChatName(
                    item.participant_name
                );


            const card =
                document.createElement(
                    "div"
                );


            // ========================================
            // カード種類
            // ========================================

            if (
                item.sender_type ===
                "owner"
            ) {

                card.className =
                    "shared-chat-item shared-chat-item-owner";

            } else if (
                item.sender_type ===
                    "moderator" &&
                isRoomModeratorName(
                    senderName
                )
            ) {

                card.className =
                    "shared-chat-item shared-chat-item-room-admin";

            } else if (
                item.sender_type ===
                "moderator"
            ) {

                card.className =
                    "shared-chat-item shared-chat-item-moderator";

            } else {

                card.className =
                    "shared-chat-item";
            }


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


            // ========================================
            // 名前表示
            // ========================================

            if (
                item.sender_type ===
                "owner"
            ) {

                name.textContent =
                    `👑 ${
                        senderName ||
                        "Owner"
                    }（Owner）`;

            } else if (
                item.sender_type ===
                    "moderator" &&
                isRoomModeratorName(
                    senderName
                )
            ) {

                name.textContent =
                    `🏠 ${
                        senderName ||
                        "管理者"
                    }（部屋主）`;

            } else if (
                item.sender_type ===
                "moderator"
            ) {

                name.textContent =
                    `🛡 ${
                        senderName ||
                        "Moderator"
                    }（Moderator）`;

            } else {

                name.textContent =
                    senderName ||
                    "名前不明";
            }


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


            meta.appendChild(
                name
            );

            meta.appendChild(
                time
            );


            // ========================================
            // 削除済み
            // ========================================

            if (
                item.is_deleted
            ) {

                card.classList.add(
                    "shared-chat-item-deleted"
                );


                const text =
                    document.createElement(
                        "div"
                    );

                text.className =
                    "shared-chat-text";

                text.textContent =
                    item.message_text ||
                    "このメッセージは削除されました";


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


            // ========================================
            // 削除ボタン
            // ========================================

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


            // ========================================
            // 画像
            // ========================================

            if (
                item.image_url
            ) {

                const imageWrapper =
                    document.createElement(
                        "div"
                    );


                imageWrapper.className =
                    "shared-chat-image";


                const image =
                    document.createElement(
                        "img"
                    );


                image.src =
                    item.image_url;

                image.alt =
                    "チャット画像";

                image.loading =
                    "lazy";

                image.decoding =
                    "async";


                image.addEventListener(
                    "click",
                    () => {

                        openSharedChatImage(
                            item.image_url
                        );
                    }
                );


                imageWrapper.appendChild(
                    image
                );


                card.appendChild(
                    imageWrapper
                );
            }


            // ========================================
            // 本文
            // ========================================

            if (
                item.message_text
            ) {

                const text =
                    document.createElement(
                        "div"
                    );


                text.className =
                    "shared-chat-text";


                text.textContent =
                    item.message_text;


                card.appendChild(
                    text
                );
            }


            sharedChatList.appendChild(
                card
            );
        }
    );


    if (
        nearBottom ||
        sharedChatList.scrollTop === 0
    ) {

        sharedChatList.scrollTop =
            sharedChatList.scrollHeight;
    }
}


// ========================================
// 削除
// ========================================

async function deleteSharedChatMessage(
    messageId
) {

    if (
        !confirm(
            "このメッセージを削除しますか？"
        )
    ) {
        return;
    }


    try {

        const client =
            getSharedChatClient();


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


        if (
            error
        ) {

            throw error;
        }


        sharedChatViewerSignature =
            "";


        await loadSharedChatViewer();


    } catch (
        error
    ) {

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


    ensureOwnerChatCompose();


    if (
        moderatorChatCompose
    ) {

        moderatorChatCompose.classList.toggle(
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

        // 部屋主情報を更新
        await loadSharedChatRoomModerators(
            client,
            sessionId
        );


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


        if (
            error
        ) {

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


    } catch (
        error
    ) {

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
// Owner送信
// ========================================

function setOwnerChatFeedback(
    text,
    isError = false
) {

    if (
        !ownerChatMessage
    ) {

        return;
    }


    ownerChatMessage.textContent =
        text;


    ownerChatMessage.classList.toggle(
        "error",
        isError
    );
}


async function sendOwnerChatMessage() {

    if (
        ownerChatSending ||
        !isOwnerChatPage() ||
        !ownerChatInput ||
        !ownerChatSendButton
    ) {

        return;
    }


    const messageText =
        ownerChatInput
            .value
            .trim();


    if (
        !messageText
    ) {

        setOwnerChatFeedback(
            "メッセージを入力してください。",
            true
        );

        return;
    }


    if (
        messageText.length >
        100
    ) {

        setOwnerChatFeedback(
            "100文字以内で入力してください。",
            true
        );

        return;
    }


    const client =
        getSharedChatClient();


    const sessionId =
        getSharedChatSessionId();


    if (
        !client ||
        !sessionId
    ) {

        setOwnerChatFeedback(
            "現在の配信チャットを確認できません。",
            true
        );

        return;
    }


    ownerChatSending =
        true;


    ownerChatInput.disabled =
        true;


    ownerChatSendButton.disabled =
        true;


    ownerChatSendButton.textContent =
        "送信中…";


    setOwnerChatFeedback(
        ""
    );


    try {

        const {
            error
        } =
            await client.rpc(
                "send_owner_message",
                {
                    p_session_id:
                        sessionId,

                    p_message:
                        messageText
                }
            );


        if (
            error
        ) {

            throw error;
        }


        ownerChatInput.value =
            "";


        ownerChatCount.textContent =
            "0 / 100";


        setOwnerChatFeedback(
            "送信しました。"
        );


        sharedChatViewerSignature =
            "";


        await loadSharedChatViewer();


        setTimeout(
            () =>
                setOwnerChatFeedback(
                    ""
                ),
            3000
        );


    } catch (
        error
    ) {

        console.error(
            "Ownerチャット送信エラー:",
            error
        );


        setOwnerChatFeedback(
            error?.message ||
            "送信できませんでした。",
            true
        );


    } finally {

        ownerChatSending =
            false;


        ownerChatInput.disabled =
            false;


        ownerChatSendButton.disabled =
            false;


        ownerChatSendButton.textContent =
            "Owner送信";


        ownerChatInput.focus();
    }
}


// ========================================
// Moderator送信
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


    moderatorChatMessage.classList.toggle(
        "error",
        isError
    );
}


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


    if (
        !messageText
    ) {

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


        if (
            error
        ) {

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


        sharedChatViewerSignature =
            "";


        await loadSharedChatViewer();


        setTimeout(
            () =>
                setModeratorChatFeedback(
                    ""
                ),
            5000
        );


    } catch (
        error
    ) {

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

    moderatorChatInput.addEventListener(
        "input",
        () => {

            if (
                moderatorChatCount
            ) {

                moderatorChatCount.textContent =
                    `${moderatorChatInput.value.length} / 100`;
            }
        }
    );


    moderatorChatInput.addEventListener(
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


    moderatorChatSendButton.addEventListener(
        "click",
        sendModeratorChatMessage
    );
}


// ========================================
// 起動
// ========================================

setTimeout(
    loadSharedChatViewer,
    1000
);


// ========================================
// 3秒ごとに更新
// ========================================

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