// ========================================
// YP-Manager Owner チャット利用者表示 v1.3.1
// ・正式な chat_only 状態に対応
// ・旧 viewer 状態との互換性を維持
// ・通常の観戦者をチャット専用欄に混入させない
// ========================================

const chatViewerList =
    document.getElementById(
        "chatViewerList"
    );


// ========================================
// チャット専用判定
// ========================================

function isChatOnlyAdminUser(person) {

    if (!person) {
        return false;
    }

    const status =
        String(person.status || "").trim().toLowerCase();

    const lobbyState =
        String(person.lobby_state || "").trim().toLowerCase();

    const source =
        String(person.source || "").trim().toLowerCase();

    const note =
        String(person.note || "").trim().toLowerCase();

    // 現在の正式なDB状態
    if (
        status === "chat_only" ||
        lobbyState === "chat_only" ||
        person.chat_only === true ||
        source === "chat" ||
        note === "chat_only"
    ) {
        return true;
    }

    // 旧データとの互換性
    if (
        status === "viewer" &&
        note === "viewer"
    ) {
        return true;
    }

    // 通常の観戦者は表示しない
    return false;
}


// ========================================
// チャット利用者一覧描画
// ========================================

function renderChatOnlyUsers() {

    if (!chatViewerList) {
        return;
    }

    chatViewerList.innerHTML = "";

    const viewers =
        (Array.isArray(participants) ? participants : [])
            .filter(isChatOnlyAdminUser);

    viewers.forEach(
        person => {

            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(person);


            const viewerNote =
                document.createElement("div");


            viewerNote.className =
                "date";


            viewerNote.textContent =
                "待機列には入らず、チャットのみ利用中";


            personBox.insertBefore(
                viewerNote,
                buttonsBox
            );


            buttonsBox.appendChild(
                createButton(
                    "削除",
                    "delete",
                    () =>
                        deletePerson(
                            person.id,
                            person.name
                        )
                )
            );


            chatViewerList.appendChild(
                personBox
            );
        }
    );


    if (viewers.length === 0) {

        showEmpty(
            chatViewerList,
            "現在、チャットのみの利用者はいません"
        );
    }
}


// ========================================
// メイン描画との連携
// ========================================

const originalOwnerRender =
    render;

render =
    function () {

        originalOwnerRender();

        renderChatOnlyUsers();
    };


renderChatOnlyUsers();