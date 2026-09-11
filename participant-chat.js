// ========================================
// YP-Manager URL参加者 全体共有チャット v1.3.2
// 画像投稿・削除反映・Owner/部屋主強調対応版
// ========================================


// ========================================
// 画像設定
// ========================================

const PARTICIPANT_CHAT_IMAGE_BUCKET =
    "participant-chat-images";

const PARTICIPANT_CHAT_IMAGE_MAX_WIDTH =
    1920;

const PARTICIPANT_CHAT_IMAGE_MAX_HEIGHT =
    1920;

const PARTICIPANT_CHAT_IMAGE_QUALITY =
    0.82;


// ========================================
// HTML要素
// ========================================

const participantChatSection =
    document.getElementById(
        "participantChatSection"
    );

const participantChatStatus =
    document.getElementById(
        "participantChatStatus"
    );

const participantChatList =
    document.getElementById(
        "participantChatList"
    );

const participantChatInput =
    document.getElementById(
        "participantChatInput"
    );

const participantChatCount =
    document.getElementById(
        "participantChatCount"
    );

const participantChatSendButton =
    document.getElementById(
        "participantChatSendButton"
    );

const participantChatMessage =
    document.getElementById(
        "participantChatMessage"
    );

const participantChatImageInput =
    document.getElementById(
        "participantChatImageInput"
    );

const participantChatImagePreview =
    document.getElementById(
        "participantChatImagePreview"
    );

const participantChatImagePreviewImage =
    document.getElementById(
        "participantChatImagePreviewImage"
    );

const participantChatImageRemoveButton =
    document.getElementById(
        "participantChatImageRemoveButton"
    );


// ========================================
// 状態
// ========================================

let participantChatEntry =
    null;

let participantChatBusy =
    false;

let participantChatSignature =
    "";

let participantChatSelectedImage =
    null;

let participantChatSelectedImagePreviewUrl =
    null;

// 現在の配信の部屋主名
let participantChatRoomModeratorNames =
    new Set();


// ========================================
// 時刻表示
// ========================================

function formatParticipantChatTime(
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
// 名前正規化
// ========================================

function normalizeParticipantChatName(
    value
) {

    return String(
        value || ""
    ).trim();
}


// ========================================
// フィードバック
// ========================================

function setParticipantChatFeedback(
    text,
    isError = false
) {

    participantChatMessage.textContent =
        text;

    participantChatMessage.classList.toggle(
        "error",
        isError
    );
}


// ========================================
// 部屋主一覧取得
// ========================================

async function loadParticipantChatRoomModerators() {

    participantChatRoomModeratorNames =
        new Set();

    if (
        !currentSessionId
    ) {
        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("rooms")
                .select(
                    "moderator_name,is_active"
                )
                .eq(
                    "session_id",
                    currentSessionId
                )
                .eq(
                    "is_active",
                    true
                );

        if (
            error
        ) {

            console.warn(
                "部屋主取得エラー:",
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
                        normalizeParticipantChatName(
                            room?.moderator_name
                        );

                    if (
                        name
                    ) {

                        participantChatRoomModeratorNames.add(
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
            "部屋主取得エラー:",
            error
        );
    }
}


// ========================================
// 部屋主判定
// ========================================

function isParticipantChatRoomModerator(
    name
) {

    const normalized =
        normalizeParticipantChatName(
            name
        );

    if (
        !normalized
    ) {
        return false;
    }

    return participantChatRoomModeratorNames.has(
        normalized
    );
}


// ========================================
// 選択画像クリア
// ========================================

function clearParticipantChatSelectedImage() {

    participantChatSelectedImage =
        null;

    if (
        participantChatSelectedImagePreviewUrl
    ) {

        URL.revokeObjectURL(
            participantChatSelectedImagePreviewUrl
        );

        participantChatSelectedImagePreviewUrl =
            null;
    }

    if (
        participantChatImagePreviewImage
    ) {

        participantChatImagePreviewImage.src =
            "";
    }

    if (
        participantChatImagePreview
    ) {

        participantChatImagePreview.classList.add(
            "hidden"
        );
    }

    if (
        participantChatImageInput
    ) {

        participantChatImageInput.value =
            "";
    }
}


// ========================================
// 画像選択
// ========================================

function handleParticipantChatImageSelected(
    file
) {

    clearParticipantChatSelectedImage();

    if (!file) {
        return;
    }

    if (
        !file.type ||
        !file.type.startsWith(
            "image/"
        )
    ) {

        setParticipantChatFeedback(
            "画像ファイルを選択してください。",
            true
        );

        return;
    }

    participantChatSelectedImage =
        file;

    participantChatSelectedImagePreviewUrl =
        URL.createObjectURL(
            file
        );

    if (
        participantChatImagePreviewImage
    ) {

        participantChatImagePreviewImage.src =
            participantChatSelectedImagePreviewUrl;
    }

    if (
        participantChatImagePreview
    ) {

        participantChatImagePreview.classList.remove(
            "hidden"
        );
    }

    setParticipantChatFeedback("");
}


// ========================================
// 画像圧縮
// ========================================

async function compressParticipantChatImage(
    file
) {

    const objectUrl =
        URL.createObjectURL(
            file
        );

    try {

        const image =
            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const img =
                        new Image();

                    img.onload =
                        () => resolve(img);

                    img.onerror =
                        () =>
                            reject(
                                new Error(
                                    "画像を読み込めませんでした。"
                                )
                            );

                    img.src =
                        objectUrl;
                }
            );

        let width =
            image.naturalWidth ||
            image.width;

        let height =
            image.naturalHeight ||
            image.height;

        const scale =
            Math.min(
                1,
                PARTICIPANT_CHAT_IMAGE_MAX_WIDTH /
                    width,
                PARTICIPANT_CHAT_IMAGE_MAX_HEIGHT /
                    height
            );

        width =
            Math.max(
                1,
                Math.round(
                    width * scale
                )
            );

        height =
            Math.max(
                1,
                Math.round(
                    height * scale
                )
            );

        const canvas =
            document.createElement(
                "canvas"
            );

        canvas.width =
            width;

        canvas.height =
            height;

        const context =
            canvas.getContext(
                "2d"
            );

        if (!context) {

            throw new Error(
                "画像処理を開始できませんでした。"
            );
        }

        context.drawImage(
            image,
            0,
            0,
            width,
            height
        );

        const webpBlob =
            await new Promise(
                resolve => {

                    canvas.toBlob(
                        resolve,
                        "image/webp",
                        PARTICIPANT_CHAT_IMAGE_QUALITY
                    );
                }
            );

        if (
            webpBlob
        ) {

            return {
                blob:
                    webpBlob,

                extension:
                    "webp"
            };
        }

        const jpegBlob =
            await new Promise(
                resolve => {

                    canvas.toBlob(
                        resolve,
                        "image/jpeg",
                        PARTICIPANT_CHAT_IMAGE_QUALITY
                    );
                }
            );

        if (
            jpegBlob
        ) {

            return {
                blob:
                    jpegBlob,

                extension:
                    "jpg"
            };
        }

        throw new Error(
            "画像の圧縮に失敗しました。"
        );

    } finally {

        URL.revokeObjectURL(
            objectUrl
        );
    }
}


// ========================================
// 画像アップロード
// ========================================

async function uploadParticipantChatImage(
    file
) {

    const compressed =
        await compressParticipantChatImage(
            file
        );

    const path =
        `${currentSessionId}/${participantChatEntry.id}/${crypto.randomUUID()}.${compressed.extension}`;

    const contentType =
        compressed.extension ===
        "webp"
            ? "image/webp"
            : "image/jpeg";

    const {
        error:
            uploadError
    } =
        await supabaseClient
            .storage
            .from(
                PARTICIPANT_CHAT_IMAGE_BUCKET
            )
            .upload(
                path,
                compressed.blob,
                {
                    contentType:
                        contentType,

                    cacheControl:
                        "3600",

                    upsert:
                        false
                }
            );

    if (
        uploadError
    ) {

        throw uploadError;
    }

    const {
        data:
            publicUrlData
    } =
        supabaseClient
            .storage
            .from(
                PARTICIPANT_CHAT_IMAGE_BUCKET
            )
            .getPublicUrl(
                path
            );

    const publicUrl =
        publicUrlData?.publicUrl;

    if (
        !publicUrl
    ) {

        throw new Error(
            "画像URLを取得できませんでした。"
        );
    }

    return {
        url:
            publicUrl,

        path:
            path
    };
}


// ========================================
// 画像拡大
// ========================================

function openParticipantChatImage(
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
        () => overlay.remove();

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
// メッセージ描画
// ========================================

function renderParticipantChatMessages(
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
                    item.deleted_by_type,
                    item.deleted_by_name,
                    item.sender_type,
                    item.participant_name ||
                        "",
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
        participantChatSignature
    ) {
        return;
    }

    participantChatSignature =
        signature;

    const nearBottom =
        participantChatList.scrollHeight -
        participantChatList.scrollTop -
        participantChatList.clientHeight <
        80;

    participantChatList.innerHTML =
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

        participantChatList.appendChild(
            empty
        );

        return;
    }


    messages.forEach(
        item => {

            const senderName =
                normalizeParticipantChatName(
                    item.participant_name
                );

            const isOwner =
                item.sender_type ===
                "owner";

            const isModerator =
                item.sender_type ===
                "moderator";

            const isRoomModerator =
                isModerator &&
                isParticipantChatRoomModerator(
                    senderName
                );


            const card =
                document.createElement(
                    "div"
                );


            // ========================================
            // カードの色分け
            // ========================================

            if (
                isOwner
            ) {

                card.className =
                    "shared-chat-item shared-chat-item-owner";

            } else if (
                isRoomModerator
            ) {

                card.className =
                    "shared-chat-item shared-chat-item-room-admin";

            } else if (
                isModerator
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
            // 名前
            // ========================================

            if (
                isOwner
            ) {

                name.textContent =
                    `👑 ${
                        senderName ||
                        "Owner"
                    }（Owner）`;

            } else if (
                isRoomModerator
            ) {

                name.textContent =
                    `🏠 ${
                        senderName ||
                        "管理者"
                    }（部屋主）`;

            } else if (
                isModerator
            ) {

                name.textContent =
                    `🛡 ${
                        senderName ||
                        "管理者"
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
                formatParticipantChatTime(
                    item.sent_at
                );


            meta.appendChild(
                name
            );

            meta.appendChild(
                time
            );


            card.appendChild(
                meta
            );


            // ========================================
            // 削除済み
            // ========================================

            if (
                item.is_deleted
            ) {

                const deleted =
                    document.createElement(
                        "div"
                    );

                deleted.className =
                    "shared-chat-text";

                deleted.textContent =
                    "このメッセージは削除されました";

                card.appendChild(
                    deleted
                );

                participantChatList.appendChild(
                    card
                );

                return;
            }


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

                        openParticipantChatImage(
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


            participantChatList.appendChild(
                card
            );
        }
    );


    if (
        nearBottom ||
        participantChatList.scrollTop === 0
    ) {

        participantChatList.scrollTop =
            participantChatList.scrollHeight;
    }
}


// ========================================
// チャット取得
// ========================================

async function loadParticipantChatMessages() {

    if (
        !currentSessionId ||
        !participantChatEntry
    ) {
        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .rpc(
                "get_participant_messages",
                {
                    p_session_id:
                        currentSessionId
                }
            );


    if (
        error
    ) {

        console.error(
            "チャット取得エラー:",
            error
        );

        participantChatStatus.textContent =
            "チャットを取得できませんでした";

        return;
    }


    const messages =
        Array.isArray(
            data
        )
            ? data
            : [];


    participantChatStatus.textContent =
        `現在の配信・共有メッセージ ${messages.length}件`;


    renderParticipantChatMessages(
        messages
    );
}


// ========================================
// URL参加状態
// ========================================

async function refreshParticipantChatAccess() {

    if (
        !currentSessionId
    ) {

        participantChatEntry =
            null;

        participantChatSection.classList.add(
            "hidden"
        );

        document.body.classList.remove(
            "participant-chat-active"
        );

        return;
    }


    // 部屋主情報を更新
    await loadParticipantChatRoomModerators();


    const entry =
        await getMyActiveEntry();


    if (
        !entry
    ) {

        participantChatEntry =
            null;

        participantChatSection.classList.add(
            "hidden"
        );

        document.body.classList.remove(
            "participant-chat-active"
        );

        return;
    }


    participantChatEntry =
        entry;


    participantChatSection.classList.remove(
        "hidden"
    );


    document.body.classList.add(
        "participant-chat-active"
    );


    participantChatInput.disabled =
        false;


    participantChatSendButton.disabled =
        false;


    await loadParticipantChatMessages();
}


// ========================================
// メッセージ送信
// ========================================

async function sendParticipantChatMessage() {

    if (
        participantChatBusy ||
        !participantChatEntry
    ) {
        return;
    }


    const text =
        participantChatInput
            .value
            .trim();


    const selectedImage =
        participantChatSelectedImage;


    if (
        !text &&
        !selectedImage
    ) {

        setParticipantChatFeedback(
            "メッセージまたは画像を入力してください。",
            true
        );

        return;
    }


    if (
        text.length >
        100
    ) {

        setParticipantChatFeedback(
            "100文字以内で入力してください。",
            true
        );

        return;
    }


    participantChatBusy =
        true;


    participantChatInput.disabled =
        true;


    if (
        participantChatImageInput
    ) {

        participantChatImageInput.disabled =
            true;
    }


    if (
        participantChatImageRemoveButton
    ) {

        participantChatImageRemoveButton.disabled =
            true;
    }


    participantChatSendButton.disabled =
        true;


    participantChatSendButton.textContent =
        "送信中…";


    setParticipantChatFeedback(
        ""
    );


    try {

        const token =
            getCancelToken(
                participantChatEntry.id
            ) ||
            await ensureCancelToken(
                participantChatEntry
            );


        if (
            !token
        ) {

            throw new Error(
                "本人確認情報を取得できませんでした。"
            );
        }


        let imageUrl =
            null;

        let imagePath =
            null;


        if (
            selectedImage
        ) {

            setParticipantChatFeedback(
                "画像を圧縮・アップロード中…"
            );


            const uploaded =
                await uploadParticipantChatImage(
                    selectedImage
                );


            imageUrl =
                uploaded.url;

            imagePath =
                uploaded.path;
        }


        let error =
            null;


        if (
            imageUrl
        ) {

            const result =
                await supabaseClient
                    .rpc(
                        "send_participant_message_with_image",
                        {
                            p_participant_id:
                                participantChatEntry.id,

                            p_cancel_token:
                                token,

                            p_message:
                                text,

                            p_image_url:
                                imageUrl,

                            p_image_path:
                                imagePath
                        }
                    );


            error =
                result.error;

        } else {

            const result =
                await supabaseClient
                    .rpc(
                        "send_participant_message",
                        {
                            p_participant_id:
                                participantChatEntry.id,

                            p_cancel_token:
                                token,

                            p_message:
                                text
                        }
                    );


            error =
                result.error;
        }


        if (
            error
        ) {

            throw error;
        }


        participantChatInput.value =
            "";


        participantChatCount.textContent =
            "0 / 100";


        clearParticipantChatSelectedImage();


        setParticipantChatFeedback(
            "送信しました。5秒後に次を送れます。"
        );


        await loadParticipantChatMessages();


        setTimeout(
            () =>
                setParticipantChatFeedback(
                    ""
                ),
            5000
        );


    } catch (
        error
    ) {

        console.error(
            "チャット送信エラー:",
            error
        );


        setParticipantChatFeedback(
            error?.message ||
            "送信できませんでした。",
            true
        );


    } finally {

        participantChatBusy =
            false;


        participantChatInput.disabled =
            false;


        if (
            participantChatImageInput
        ) {

            participantChatImageInput.disabled =
                false;
        }


        if (
            participantChatImageRemoveButton
        ) {

            participantChatImageRemoveButton.disabled =
                false;
        }


        participantChatSendButton.disabled =
            false;


        participantChatSendButton.textContent =
            "送信";


        participantChatInput.focus();
    }
}


// ========================================
// 本文入力
// ========================================

participantChatInput.addEventListener(
    "input",
    () => {

        participantChatCount.textContent =
            `${participantChatInput.value.length} / 100`;
    }
);


// ========================================
// Enter送信
// ========================================

participantChatInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
                "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendParticipantChatMessage();
        }
    }
);


// ========================================
// 送信ボタン
// ========================================

participantChatSendButton.addEventListener(
    "click",
    sendParticipantChatMessage
);


// ========================================
// 画像選択
// ========================================

if (
    participantChatImageInput
) {

    participantChatImageInput.addEventListener(
        "change",
        () => {

            const file =
                participantChatImageInput.files?.[0] ||
                null;

            handleParticipantChatImageSelected(
                file
            );
        }
    );
}


// ========================================
// 画像取消
// ========================================

if (
    participantChatImageRemoveButton
) {

    participantChatImageRemoveButton.addEventListener(
        "click",
        clearParticipantChatSelectedImage
    );
}


// ========================================
// 起動
// ========================================

setTimeout(
    refreshParticipantChatAccess,
    700
);


// ========================================
// 3秒ごとに更新
// ========================================

setInterval(
    async () => {

        if (
            document.hidden ||
            participantChatBusy
        ) {
            return;
        }

        await refreshParticipantChatAccess();

    },
    3000
);