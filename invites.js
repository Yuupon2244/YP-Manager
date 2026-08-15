// ========================================
// YP-Manager Moderator招待管理 v1.0.0
// Owner専用
// ========================================


// ========================================
// 状態
// ========================================

let inviteDecorationScheduled =
    false;


const creatingInviteRoomIds =
    new Set();


// ========================================
// 招待コード発行
// ========================================

async function createModeratorInvite(
    room
) {

    if (
        !room ||
        !room.id
    ) {

        alert(
            "待機部屋情報を取得できませんでした。"
        );

        return;
    }


    // 連打による二重発行を防止
    if (
        creatingInviteRoomIds.has(
            room.id
        )
    ) {

        return;
    }


    // =====================================
    // Owner確認
    // =====================================

    if (
        typeof ypAdminProfile ===
            "undefined" ||
        !ypAdminProfile ||
        ypAdminProfile.role !==
            "owner"
    ) {

        alert(
            "Ownerだけが招待コードを発行できます。"
        );

        return;
    }


    try {

        creatingInviteRoomIds.add(
            room.id
        );


        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "owner_create_moderator_invite",
                    {
                        p_room_id:
                            room.id
                    }
                );


        if (error) {

            throw error;
        }


        if (!data) {

            throw new Error(
                "招待コードを取得できませんでした。"
            );
        }


        const inviteCode =
            String(
                data
            );


        // 発行後、そのまま自動コピー
        const copied =
            await copyText(
                inviteCode
            );


        showInviteDialog(
            room,
            inviteCode,
            copied
        );

    } catch (error) {

        console.error(
            "招待コード発行エラー:",
            error
        );


        alert(
            error.message ||
            "招待コードを発行できませんでした。"
        );

    } finally {

        creatingInviteRoomIds.delete(
            room.id
        );
    }
}

// ========================================
// 招待コード表示
// ========================================

function showInviteDialog(
    room,
    inviteCode,
    alreadyCopied = false
) {
    // 既存モーダル削除
    const oldModal =
        document.getElementById(
            "ypInviteModal"
        );


    if (oldModal) {

        oldModal.remove();
    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "ypInviteModal";


    overlay.style.position =
        "fixed";

    overlay.style.inset =
        "0";

    overlay.style.zIndex =
        "999999";

    overlay.style.background =
        "rgba(0,0,0,.72)";

    overlay.style.display =
        "flex";

    overlay.style.alignItems =
        "center";

    overlay.style.justifyContent =
        "center";

    overlay.style.padding =
        "18px";


    const box =
        document.createElement(
            "div"
        );


    box.style.width =
        "100%";

    box.style.maxWidth =
        "460px";

    box.style.background =
        "#2c2c2c";

    box.style.borderRadius =
        "16px";

    box.style.padding =
        "22px";

    box.style.boxShadow =
        "0 12px 40px rgba(0,0,0,.4)";


    // =====================================
    // タイトル
    // =====================================

    const title =
        document.createElement(
            "div"
        );


    title.textContent =
        "🎟 Moderator招待コード";


    title.style.fontSize =
        "21px";

    title.style.fontWeight =
        "bold";

    title.style.marginBottom =
        "8px";


    // =====================================
    // 部屋名
    // =====================================

    const roomText =
        document.createElement(
            "div"
        );


    roomText.textContent =
        `🏠 ${room.name}`;


    roomText.style.color =
        "#ccc";

    roomText.style.marginBottom =
        "16px";


    // =====================================
    // コード
    // =====================================

    const codeBox =
        document.createElement(
            "div"
        );


    codeBox.textContent =
        inviteCode;


    codeBox.style.padding =
        "16px";

    codeBox.style.background =
        "#1d1d1d";

    codeBox.style.borderRadius =
        "10px";

    codeBox.style.textAlign =
        "center";

    codeBox.style.fontSize =
        "24px";

    codeBox.style.fontWeight =
        "bold";

    codeBox.style.letterSpacing =
        "2px";

    codeBox.style.wordBreak =
        "break-all";

    codeBox.style.marginBottom =
        "12px";


    // =====================================
    // 説明
    // =====================================

    const note =
        document.createElement(
            "div"
        );


    note.innerHTML = `
        <div>⏰ 有効期限：24時間</div>
        <div>🔒 1回使用すると無効になります</div>
        <div>📱 Moderator側はメールアドレス不要です</div>
    `;


    note.style.fontSize =
        "13px";

    note.style.color =
        "#bbb";

    note.style.lineHeight =
        "1.8";

    note.style.marginBottom =
        "16px";


    // =====================================
    // コピーボタン
    // =====================================

    const copyButton =
        document.createElement(
            "button"
        );


    copyButton.type =
        "button";


    copyButton.textContent =
        alreadyCopied
            ? "✅ 招待コードをコピーしました"
            : "📋 招待コードをコピー";


    copyButton.style.width =
        "100%";

    copyButton.style.minHeight =
        "48px";

    copyButton.style.border =
        "none";

    copyButton.style.borderRadius =
        "9px";

    copyButton.style.background =
        "#3975b5";

    copyButton.style.color =
        "white";

    copyButton.style.fontWeight =
        "bold";

    copyButton.style.fontSize =
        "15px";

    copyButton.style.cursor =
        "pointer";

    copyButton.style.marginBottom =
        "9px";


    copyButton.onclick =
        async () => {

            const success =
                await copyText(
                    inviteCode
                );


            if (success) {

                copyButton.textContent =
                    "✅ コピーしました";


                setTimeout(
                    () => {

                        copyButton.textContent =
                            "📋 招待コードをコピー";

                    },
                    1800
                );

            } else {

                prompt(
                    "この招待コードをコピーしてください。",
                    inviteCode
                );
            }
        };


    // =====================================
    // 閉じる
    // =====================================

    const closeButton =
        document.createElement(
            "button"
        );


    closeButton.type =
        "button";


    closeButton.textContent =
        "閉じる";


    closeButton.style.width =
        "100%";

    closeButton.style.minHeight =
        "44px";

    closeButton.style.border =
        "none";

    closeButton.style.borderRadius =
        "9px";

    closeButton.style.background =
        "#555";

    closeButton.style.color =
        "white";

    closeButton.style.cursor =
        "pointer";


    closeButton.onclick =
        () => {

            overlay.remove();
        };


    box.appendChild(
        title
    );

    box.appendChild(
        roomText
    );

    box.appendChild(
        codeBox
    );

    box.appendChild(
        note
    );

    box.appendChild(
        copyButton
    );

    box.appendChild(
        closeButton
    );


    overlay.appendChild(
        box
    );


    document.body.appendChild(
        overlay
    );


    // 背景クリックでも閉じる
    overlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                overlay
            ) {

                overlay.remove();
            }
        }
    );
}


// ========================================
// クリップボード
// ========================================

async function copyText(
    text
) {

    try {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            await navigator.clipboard
                .writeText(
                    text
                );


            return true;
        }


        return fallbackCopyText(
            text
        );

    } catch (error) {

        console.error(
            "コピーエラー:",
            error
        );


        return fallbackCopyText(
            text
        );
    }
}


function fallbackCopyText(
    text
) {

    try {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            text;


        textarea.style.position =
            "fixed";

        textarea.style.opacity =
            "0";


        document.body.appendChild(
            textarea
        );


        textarea.focus();

        textarea.select();


        const success =
            document.execCommand(
                "copy"
            );


        textarea.remove();


        return success;

    } catch (error) {

        console.error(
            "フォールバックコピーエラー:",
            error
        );


        return false;
    }
}


// ========================================
// 部屋カードにボタン追加
// ========================================

function decorateRoomInviteButtons() {

    if (
        typeof rooms ===
            "undefined" ||
        !Array.isArray(
            rooms
        )
    ) {

        return;
    }


    const roomListElement =
        document.getElementById(
            "roomList"
        );


    if (!roomListElement) {

        return;
    }


    const cards =
        Array.from(
            roomListElement.children
        );


    rooms.forEach(
        (
            room,
            index
        ) => {

            const card =
                cards[index];


            if (!card) {

                return;
            }


            const buttonsBox =
                card.querySelector(
                    ".buttons"
                );


            if (!buttonsBox) {

                return;
            }


            // すでに追加済み
            if (
                buttonsBox.querySelector(
                    ".moderator-invite-button"
                )
            ) {

                return;
            }


            const inviteButton =
                document.createElement(
                    "button"
                );


            inviteButton.type =
                "button";


            inviteButton.className =
                "move moderator-invite-button";


            inviteButton.textContent =
                "🎟 招待コード";


            inviteButton.onclick =
                () =>
                    createModeratorInvite(
                        room
                    );


            // 「部屋を閉じる」の前へ
            const closeButton =
                Array.from(
                    buttonsBox.children
                ).find(
                    button =>
                        button.textContent.includes(
                            "部屋を閉じる"
                        )
                );


            if (closeButton) {

                buttonsBox.insertBefore(
                    inviteButton,
                    closeButton
                );

            } else {

                buttonsBox.appendChild(
                    inviteButton
                );
            }
        }
    );
}


// ========================================
// ボタン装着予約
// ========================================

function scheduleInviteDecoration() {

    if (
        inviteDecorationScheduled
    ) {

        return;
    }


    inviteDecorationScheduled =
        true;


    requestAnimationFrame(
        () => {

            inviteDecorationScheduled =
                false;


            decorateRoomInviteButtons();
        }
    );
}


// ========================================
// roomList再描画監視
// ========================================

const inviteRoomListTarget =
    document.getElementById(
        "roomList"
    );


if (
    inviteRoomListTarget
) {

    const observer =
        new MutationObserver(
            () => {

                scheduleInviteDecoration();
            }
        );


    observer.observe(
        inviteRoomListTarget,
        {
            childList:
                true
        }
    );
}


// ========================================
// 初回
// ========================================

setTimeout(
    scheduleInviteDecoration,
    900
);