// ========================================
// YP-Manager Owner チャット利用者表示 v1.3.1
// ========================================

const chatViewerList =
    document.getElementById("chatViewerList");


function isChatOnlyUserForDisplay(person) {

    if (typeof isChatOnlyPerson === "function") {
        return isChatOnlyPerson(person);
    }

    if (
        window.YPQueueRules &&
        typeof window.YPQueueRules.isChatOnlyPerson === "function"
    ) {
        return window.YPQueueRules.isChatOnlyPerson(person);
    }

    if (!person) {
        return false;
    }

    const status = String(person.status || "").trim().toLowerCase();
    const lobbyState = String(person.lobby_state || "").trim().toLowerCase();
    const source = String(person.source || "").trim().toLowerCase();
    const note = String(person.note || "").trim().toLowerCase();

    return Boolean(
        person.chat_only === true ||
        status === "chat_only" ||
        lobbyState === "chat_only" ||
        source === "chat" ||
        note === "chat_only" ||
        (
            status === "viewer" &&
            note === "viewer" &&
            lobbyState !== "watching"
        )
    );
}


function renderChatOnlyUsers() {

    if (!chatViewerList) {
        return;
    }

    chatViewerList.innerHTML = "";

    const list =
        Array.isArray(participants)
            ? participants
            : [];

    const viewers =
        list.filter(isChatOnlyUserForDisplay);

    viewers.forEach(person => {

        const {
            personBox,
            buttonsBox
        } = createPersonBox(person);

        const viewerNote =
            document.createElement("div");

        viewerNote.className = "date";
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
                () => deletePerson(person.id, person.name)
            )
        );

        chatViewerList.appendChild(personBox);
    });

    if (viewers.length === 0) {
        showEmpty(
            chatViewerList,
            "現在、チャットのみの利用者はいません"
        );
    }
}


const originalOwnerRender = render;

render = function () {
    originalOwnerRender();
    renderChatOnlyUsers();
};


renderChatOnlyUsers();