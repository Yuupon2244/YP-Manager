// ========================================
// YP-Manager URL参加者 全体共有チャット v1.0.0
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


let participantChatEntry =
    null;

let participantChatBusy =
    false;

let participantChatSignature =
    "";


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
// 送信結果表示
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
                    item.sent_at
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


        participantChatList.appendChild(
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
    	item.sender_type === "moderator"
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
    item.sender_type === "moderator"
        ? `🛡 ${item.participant_name || "管理者"}（Moderator）`
        : item.participant_name || "名前不明";


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


            card.appendChild(
                meta
            );


            card.appendChild(
                text
            );


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


    if (error) {

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
// URL参加状態を確認
// ========================================

async function refreshParticipantChatAccess() {

    if (!currentSessionId) {

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


    const entry =
        await getMyActiveEntry();


    if (!entry) {

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


    if (!text) {

        setParticipantChatFeedback(
            "メッセージを入力してください。",
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


        if (!token) {

            throw new Error(
                "本人確認情報を取得できませんでした。"
            );
        }


        const {
            error
        } =
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


        if (error) {

            throw error;
        }


        participantChatInput.value =
            "";


        participantChatCount.textContent =
            "0 / 100";


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

        participantChatBusy =
            false;


        participantChatInput.disabled =
            false;


        participantChatSendButton.disabled =
            false;


        participantChatSendButton.textContent =
            "送信";


        participantChatInput.focus();
    }
}


// ========================================
// イベント
// ========================================

participantChatInput.addEventListener(
    "input",
    () => {

        participantChatCount.textContent =
            `${participantChatInput.value.length} / 100`;
    }
);


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


participantChatSendButton.addEventListener(
    "click",
    sendParticipantChatMessage
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