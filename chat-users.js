// ========================================
// YP-Manager Owner チャット利用者表示 v1.3.0
// ========================================

const chatViewerList =
    document.getElementById(
        "chatViewerList"
    );


function renderChatOnlyUsers() {

    if (!chatViewerList) {

        return;
    }


    chatViewerList.innerHTML =
        "";


    const viewers =
        participants.filter(
            person =>
                person.status ===
                "viewer"
        );


    viewers.forEach(
        person => {

            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );


            const viewerNote =
                document.createElement(
                    "div"
                );


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


    if (
        viewers.length ===
        0
    ) {

        showEmpty(
            chatViewerList,
            "現在、チャットのみの利用者はいません"
        );
    }
}


const originalOwnerRender =
    render;


render =
    function () {

        originalOwnerRender();

        renderChatOnlyUsers();
    };


renderChatOnlyUsers();