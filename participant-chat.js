// ========================================
// YP-Manager URL参加者 全体共有チャット v1.3.4
// ・通常参加者 / チャットのみ利用者の両方に対応
// ・画像選択 / プレビュー / 自動圧縮 / 画像送信に対応
// ・チャット専用利用者は status="viewer"
// ========================================

const participantChatSection =
    document.getElementById("participantChatSection");

const participantChatStatus =
    document.getElementById("participantChatStatus");

const participantChatList =
    document.getElementById("participantChatList");

const participantChatInput =
    document.getElementById("participantChatInput");

const participantChatCount =
    document.getElementById("participantChatCount");

const participantChatSendButton =
    document.getElementById("participantChatSendButton");

const participantChatMessage =
    document.getElementById("participantChatMessage");

const participantChatImageInput =
    document.getElementById("participantChatImageInput");

const participantChatImagePreview =
    document.getElementById("participantChatImagePreview");

const participantChatImagePreviewImage =
    document.getElementById("participantChatImagePreviewImage");

const participantChatImageRemoveButton =
    document.getElementById("participantChatImageRemoveButton");

let participantChatEntry = null;
let participantChatBusy = false;
let participantChatSignature = "";
let participantChatSelectedImage = null;
let participantChatPreviewUrl = "";


// ========================================
// 時刻表示
// ========================================

function formatParticipantChatTime(value) {
    if (!value) {
        return "";
    }

    return new Date(value).toLocaleTimeString(
        "ja-JP",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


// ========================================
// 送信結果表示
// ========================================

function setParticipantChatFeedback(text, isError = false) {
    if (!participantChatMessage) {
        return;
    }

    participantChatMessage.textContent = text;
    participantChatMessage.classList.toggle("error", isError);
}


// ========================================
// 画像モーダル
// ========================================

function openParticipantChatImage(imageUrl) {
    if (!imageUrl) {
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "shared-chat-image-modal";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "shared-chat-image-modal-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "閉じる");

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "チャット画像";
    image.className = "shared-chat-image-modal-image";

    overlay.appendChild(closeButton);
    overlay.appendChild(image);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    closeButton.addEventListener("click", event => {
        event.stopPropagation();
        close();
    });

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            close();
        }
    });
}


// ========================================
// チャット描画
// ========================================

function renderParticipantChatMessages(messages) {
    const signature = JSON.stringify(
        messages.map(item => [
            item.message_id,
            item.sent_at,
            item.is_deleted,
            item.message_text || "",
            item.image_url || "",
            item.image_path || ""
        ])
    );

    if (signature === participantChatSignature) {
        return;
    }

    participantChatSignature = signature;

    if (!participantChatList) {
        return;
    }

    const nearBottom =
        participantChatList.scrollHeight -
        participantChatList.scrollTop -
        participantChatList.clientHeight < 80;

    participantChatList.innerHTML = "";

    if (messages.length === 0) {
        const empty = document.createElement("div");
        empty.className = "shared-chat-empty";
        empty.textContent = "まだメッセージはありません";
        participantChatList.appendChild(empty);
        return;
    }

    messages.forEach(item => {
        const card = document.createElement("div");

        card.className =
            item.sender_type === "owner"
                ? "shared-chat-item shared-chat-item-owner"
                : item.sender_type === "moderator"
                    ? "shared-chat-item shared-chat-item-moderator"
                    : "shared-chat-item";

        const meta = document.createElement("div");
        meta.className = "shared-chat-meta";

        const name = document.createElement("div");
        name.className = "shared-chat-name";

        if (item.sender_type === "owner") {
            name.textContent =
                `👑 ${item.participant_name || "Owner"}（Owner）`;
        } else if (item.sender_type === "moderator") {
            name.textContent =
                `🛡 ${item.participant_name || "Moderator"}（Moderator）`;
        } else {
            name.textContent =
                item.participant_name || "名前不明";
        }

        const time = document.createElement("div");
        time.className = "shared-chat-time";
        time.textContent =
            formatParticipantChatTime(item.sent_at);

        meta.appendChild(name);
        meta.appendChild(time);
        card.appendChild(meta);

        if (item.is_deleted) {
            card.classList.add("shared-chat-item-deleted");

            const deletedNote =
                document.createElement("div");

            deletedNote.className =
                "shared-chat-deleted-note";

            deletedNote.textContent =
                item.deleted_by_name
                    ? `削除済み（${item.deleted_by_name}）`
                    : "削除済み";

            card.appendChild(deletedNote);
        } else {
            if (item.image_url) {
                const imageWrapper =
                    document.createElement("div");

                imageWrapper.className =
                    "shared-chat-image";

                const image =
                    document.createElement("img");

                image.src = item.image_url;
                image.alt = "チャット画像";
                image.loading = "lazy";
                image.decoding = "async";

                image.addEventListener("click", () => {
                    openParticipantChatImage(
                        item.image_url
                    );
                });

                imageWrapper.appendChild(image);
                card.appendChild(imageWrapper);
            }

            const text =
                document.createElement("div");

            text.className = "shared-chat-text";
            text.textContent =
                item.message_text || "";

            card.appendChild(text);
        }

        participantChatList.appendChild(card);
    });

    if (
        nearBottom ||
        participantChatList.scrollTop === 0
    ) {
        participantChatList.scrollTop =
            participantChatList.scrollHeight;
    }
}


// ========================================
// 自分の参加 / チャット専用エントリを取得
// ========================================

async function getMyParticipantChatEntry() {
    if (!currentSessionId) {
        return null;
    }

    if (
        typeof URL_USER_ID === "undefined" ||
        !URL_USER_ID
    ) {
        return null;
    }

    const { data, error } =
        await supabaseClient
            .from("participants")
            .select("*")
            .eq("user_id", URL_USER_ID)
            .eq("session_id", currentSessionId)
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

    return data && data.length > 0
        ? data[0]
        : null;
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

    const { data, error } =
        await supabaseClient.rpc(
            "get_participant_messages",
            {
                p_session_id:
                    currentSessionId
            }
        );

    if (error) {
        console.error(
            "チャット取得エラー:",
            error
        );

        if (participantChatStatus) {
            participantChatStatus.textContent =
                "チャットを取得できませんでした";
        }

        return;
    }

    const messages =
        Array.isArray(data)
            ? data
            : [];

    if (participantChatStatus) {
        participantChatStatus.textContent =
            `現在の配信・共有メッセージ ${messages.length}件`;
    }

    renderParticipantChatMessages(messages);
}


// ========================================
// チャット利用可否
// ========================================

async function refreshParticipantChatAccess() {
    if (!currentSessionId) {
        participantChatEntry = null;

        participantChatSection?.classList.add(
            "hidden"
        );

        document.body.classList.remove(
            "participant-chat-active"
        );

        return;
    }

    const entry =
        await getMyParticipantChatEntry();

    if (!entry) {
        participantChatEntry = null;

        participantChatSection?.classList.add(
            "hidden"
        );

        document.body.classList.remove(
            "participant-chat-active"
        );

        return;
    }

    participantChatEntry = entry;

    participantChatSection?.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "participant-chat-active"
    );

    if (participantChatInput) {
        participantChatInput.disabled = false;
    }

    if (participantChatSendButton) {
        participantChatSendButton.disabled = false;
    }

    if (participantChatImageInput) {
        participantChatImageInput.disabled = false;
    }

    await loadParticipantChatMessages();
}


// ========================================
// 画像リセット
// ========================================

function clearParticipantChatImage() {
    participantChatSelectedImage = null;

    if (participantChatPreviewUrl) {
        URL.revokeObjectURL(
            participantChatPreviewUrl
        );

        participantChatPreviewUrl = "";
    }

    if (participantChatImageInput) {
        participantChatImageInput.value = "";
    }

    if (participantChatImagePreviewImage) {
        participantChatImagePreviewImage.removeAttribute(
            "src"
        );
    }

    participantChatImagePreview?.classList.add(
        "hidden"
    );
}


// ========================================
// 画像読み込み
// ========================================

function loadImageElement(file) {
    return new Promise((resolve, reject) => {
        const objectUrl =
            URL.createObjectURL(file);

        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = error => {
            URL.revokeObjectURL(objectUrl);
            reject(error);
        };

        image.src = objectUrl;
    });
}


// ========================================
// 自動圧縮
// ========================================

async function compressParticipantChatImage(file) {
    const image =
        await loadImageElement(file);

    const MAX_SIZE = 1920;

    const originalWidth =
        image.naturalWidth ||
        image.width;

    const originalHeight =
        image.naturalHeight ||
        image.height;

    if (
        !originalWidth ||
        !originalHeight
    ) {
        throw new Error(
            "画像を読み込めませんでした。"
        );
    }

    const scale =
        Math.min(
            1,
            MAX_SIZE / originalWidth,
            MAX_SIZE / originalHeight
        );

    const width =
        Math.max(
            1,
            Math.round(
                originalWidth * scale
            )
        );

    const height =
        Math.max(
            1,
            Math.round(
                originalHeight * scale
            )
        );

    const canvas =
        document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context =
        canvas.getContext("2d");

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

    const blob =
        await new Promise(resolve => {
            canvas.toBlob(
                result => resolve(result),
                "image/jpeg",
                0.82
            );
        });

    if (!blob) {
        throw new Error(
            "画像の圧縮に失敗しました。"
        );
    }

    return new File(
        [blob],
        "chat-image.jpg",
        {
            type: "image/jpeg",
            lastModified: Date.now()
        }
    );
}


async function handleParticipantChatImageSelected(file) {
    if (!file) {
        return;
    }

    if (
        !String(file.type || "")
            .startsWith("image/")
    ) {
        setParticipantChatFeedback(
            "画像ファイルを選択してください。",
            true
        );

        clearParticipantChatImage();
        return;
    }

    try {
        setParticipantChatFeedback(
            "画像を準備しています…"
        );

        const compressed =
            await compressParticipantChatImage(
                file
            );

        participantChatSelectedImage =
            compressed;

        if (participantChatPreviewUrl) {
            URL.revokeObjectURL(
                participantChatPreviewUrl
            );
        }

        participantChatPreviewUrl =
            URL.createObjectURL(
                compressed
            );

        if (
            participantChatImagePreviewImage
        ) {
            participantChatImagePreviewImage.src =
                participantChatPreviewUrl;
        }

        participantChatImagePreview?.classList.remove(
            "hidden"
        );

        setParticipantChatFeedback("");
    } catch (error) {
        console.error(
            "画像準備エラー:",
            error
        );

        clearParticipantChatImage();

        setParticipantChatFeedback(
            error?.message ||
                "画像を準備できませんでした。",
            true
        );
    }
}


// ========================================
// 画像アップロード
// ========================================

async function uploadParticipantChatImage(file) {
    const path =
        `${currentSessionId}/${participantChatEntry.id}/${crypto.randomUUID()}.jpg`;

    const { error } =
        await supabaseClient
            .storage
            .from("participant-chat-images")
            .upload(
                path,
                file,
                {
                    contentType: "image/jpeg",
                    cacheControl: "31536000",
                    upsert: false
                }
            );

    if (error) {
        throw error;
    }

    const { data } =
        supabaseClient
            .storage
            .from("participant-chat-images")
            .getPublicUrl(path);

    if (!data?.publicUrl) {
        throw new Error(
            "画像URLを取得できませんでした。"
        );
    }

    return {
        path,
        url: data.publicUrl
    };
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
        participantChatInput?.value.trim() ||
        "";

    const hasImage =
        !!participantChatSelectedImage;

    if (!text && !hasImage) {
        setParticipantChatFeedback(
            "メッセージまたは画像を選択してください。",
            true
        );

        return;
    }

    if (text.length > 100) {
        setParticipantChatFeedback(
            "100文字以内で入力してください。",
            true
        );

        return;
    }

    participantChatBusy = true;

    if (participantChatInput) {
        participantChatInput.disabled = true;
    }

    if (participantChatImageInput) {
        participantChatImageInput.disabled = true;
    }

    if (participantChatSendButton) {
        participantChatSendButton.disabled = true;
        participantChatSendButton.textContent =
            "送信中…";
    }

    setParticipantChatFeedback("");

    try {
        const token =
            typeof getCancelToken ===
            "function"
                ? getCancelToken(
                    participantChatEntry.id
                ) ||
                  await ensureCancelToken(
                      participantChatEntry
                  )
                : null;

        if (!token) {
            throw new Error(
                "本人確認情報を取得できませんでした。"
            );
        }

        let imageUrl = null;
        let imagePath = null;

        if (participantChatSelectedImage) {
            setParticipantChatFeedback(
                "画像をアップロードしています…"
            );

            const uploaded =
                await uploadParticipantChatImage(
                    participantChatSelectedImage
                );

            imageUrl = uploaded.url;
            imagePath = uploaded.path;
        }

        setParticipantChatFeedback(
            "送信しています…"
        );

        const { error } =
            await supabaseClient.rpc(
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

        if (error) {
            throw error;
        }

        if (participantChatInput) {
            participantChatInput.value = "";
        }

        if (participantChatCount) {
            participantChatCount.textContent =
                "0 / 100";
        }

        clearParticipantChatImage();

        setParticipantChatFeedback(
            "送信しました。5秒後に次を送れます。"
        );

        await loadParticipantChatMessages();

        setTimeout(
            () =>
                setParticipantChatFeedback(""),
            5000
        );
    } catch (error) {
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
        participantChatBusy = false;

        if (participantChatInput) {
            participantChatInput.disabled =
                false;
        }

        if (participantChatImageInput) {
            participantChatImageInput.disabled =
                false;
        }

        if (participantChatSendButton) {
            participantChatSendButton.disabled =
                false;

            participantChatSendButton.textContent =
                "送信";
        }
    }
}


// ========================================
// イベント
// ========================================

participantChatInput?.addEventListener(
    "input",
    () => {
        if (participantChatCount) {
            participantChatCount.textContent =
                `${participantChatInput.value.length} / 100`;
        }
    }
);


participantChatInput?.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {
            event.preventDefault();
            sendParticipantChatMessage();
        }
    }
);


participantChatSendButton?.addEventListener(
    "click",
    sendParticipantChatMessage
);


participantChatImageInput?.addEventListener(
    "change",
    async event => {
        const file =
            event.target?.files?.[0] ||
            null;

        await handleParticipantChatImageSelected(
            file
        );
    }
);


participantChatImageRemoveButton?.addEventListener(
    "click",
    clearParticipantChatImage
);


// ========================================
// 起動・3秒更新
// ========================================

setTimeout(
    refreshParticipantChatAccess,
    700
);

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