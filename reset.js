// ========================================
// YP-Manager 配信セッション管理 v1.1.0
// Owner専用
// ========================================


// ========================================
// 管理エリア生成
// ========================================

function createSessionControlArea() {

    if (
        document.getElementById(
            "ypSessionControlArea"
        )
    ) {

        return;
    }


    const container =
        document.querySelector(
            ".container"
        );


    if (!container) {

        return;
    }


    const area =
        document.createElement(
            "div"
        );


    area.id =
        "ypSessionControlArea";


    area.style.margin =
        "28px 0 10px";


    area.style.padding =
        "16px";


    area.style.background =
        "#2d2d2d";


    area.style.borderRadius =
        "12px";


    area.style.border =
        "1px solid #555";


    // =====================================
    // タイトル
    // =====================================

    const title =
        document.createElement(
            "div"
        );


    title.textContent =
        "🎮 配信セッション管理";


    title.style.fontWeight =
        "bold";


    title.style.fontSize =
        "18px";


    title.style.marginBottom =
        "12px";


    area.appendChild(
        title
    );


    // =====================================
    // 新しい配信開始
    // =====================================

    const startNote =
        document.createElement(
            "div"
        );


    startNote.textContent =
        "新しい参加型配信を開始すると、新しいセッションIDが発行されます。";


    startNote.style.fontSize =
        "13px";


    startNote.style.color =
        "#ccc";


    startNote.style.marginBottom =
        "10px";


    area.appendChild(
        startNote
    );


    const startButton =
        document.createElement(
            "button"
        );


    startButton.id =
        "ypStartSessionButton";


    startButton.type =
        "button";


    startButton.textContent =
        "▶ 新しい配信を開始";


    startButton.style.width =
        "100%";


    startButton.style.padding =
        "12px";


    startButton.style.border =
        "none";


    startButton.style.borderRadius =
        "9px";


    startButton.style.background =
        "#2f8f4e";


    startButton.style.color =
        "white";


    startButton.style.fontWeight =
        "bold";


    startButton.style.fontSize =
        "16px";


    startButton.style.cursor =
        "pointer";


    startButton.addEventListener(
        "click",
        startNewSession
    );


    area.appendChild(
        startButton
    );


    // =====================================
    // 区切り
    // =====================================

    const divider =
        document.createElement(
            "div"
        );


    divider.style.height =
        "1px";


    divider.style.background =
        "#555";


    divider.style.margin =
        "18px 0";


    area.appendChild(
        divider
    );


    // =====================================
    // 全リセット
    // =====================================

    const resetTitle =
        document.createElement(
            "div"
        );


    resetTitle.textContent =
        "⚠️ 配信中データの全リセット";


    resetTitle.style.fontWeight =
        "bold";


    resetTitle.style.marginBottom =
        "8px";


    resetTitle.style.color =
        "#ffb0b0";


    area.appendChild(
        resetTitle
    );


    const resetNote =
        document.createElement(
            "div"
        );


    resetNote.textContent =
        "参加者と待機部屋をすべて削除します。現在の配信セッションIDと管理者アカウントは残ります。";


    resetNote.style.fontSize =
        "13px";


    resetNote.style.color =
        "#ccc";


    resetNote.style.marginBottom =
        "12px";


    area.appendChild(
        resetNote
    );


    const resetButton =
        document.createElement(
            "button"
        );


    resetButton.id =
        "ypFullResetButton";


    resetButton.type =
        "button";


    resetButton.textContent =
        "⚠️ 全リセット";


    resetButton.style.width =
        "100%";


    resetButton.style.padding =
        "12px";


    resetButton.style.border =
        "none";


    resetButton.style.borderRadius =
        "9px";


    resetButton.style.background =
        "#b33d3d";


    resetButton.style.color =
        "white";


    resetButton.style.fontWeight =
        "bold";


    resetButton.style.fontSize =
        "16px";


    resetButton.style.cursor =
        "pointer";


    resetButton.addEventListener(
        "click",
        executeFullReset
    );


    area.appendChild(
        resetButton
    );


    container.appendChild(
        area
    );
}


// ========================================
// Owner確認
// ========================================

function isOwnerReady() {

    return (
        typeof ypAdminProfile !==
            "undefined" &&
        ypAdminProfile &&
        ypAdminProfile.role ===
            "owner"
    );
}


// ========================================
// 新しい配信を開始
// ========================================

async function startNewSession() {

    if (!isOwnerReady()) {

        alert(
            "Ownerだけが新しい配信を開始できます。"
        );

        return;
    }


    const confirmed =
        confirm(
            "新しい配信セッションを開始しますか？\n\n" +
            "新しいセッションIDが発行されます。"
        );


    if (!confirmed) {

        return;
    }


    const button =
        document.getElementById(
            "ypStartSessionButton"
        );


    button.disabled =
        true;


    button.textContent =
        "開始中…";


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "owner_start_new_session"
                );


        if (error) {

            throw error;
        }


        console.log(
            "新規配信セッション開始:",
            data
        );


        alert(
            "新しい配信セッションを開始しました。"
        );


        // --------------------------------
        // 既存の管理画面情報を再取得
        // --------------------------------

        if (
            typeof loadCurrentSession ===
            "function"
        ) {

            await loadCurrentSession();
        }


        if (
            typeof loadParticipants ===
            "function"
        ) {

            await loadParticipants();
        }


        if (
            typeof loadRooms ===
            "function"
        ) {

            await loadRooms();
        }


        window.location.reload();

    } catch (error) {

        console.error(
            "新規配信開始エラー:",
            error
        );


        alert(
            error.message ||
            "新しい配信を開始できませんでした。"
        );


        button.disabled =
            false;


        button.textContent =
            "▶ 新しい配信を開始";
    }
}


// ========================================
// 全リセット
// ========================================

async function executeFullReset() {

    if (!isOwnerReady()) {

        alert(
            "Ownerだけが全リセットできます。"
        );

        return;
    }


    const firstConfirm =
        confirm(
            "本当に全リセットしますか？\n\n" +
            "参加者・待機部屋がすべて削除されます。\n\n" +
            "現在の配信セッションIDは残ります。"
        );


    if (!firstConfirm) {

        return;
    }


    const typed =
        prompt(
            "確認のため RESET と入力してください。"
        );


    if (
        typed !==
        "RESET"
    ) {

        alert(
            "RESET が正しく入力されなかったため、中止しました。"
        );

        return;
    }


    const button =
        document.getElementById(
            "ypFullResetButton"
        );


    button.disabled =
        true;


    button.textContent =
        "リセット中…";


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .rpc(
                    "owner_full_reset"
                );


        if (error) {

            throw error;
        }


        console.log(
            "全リセット成功:",
            data
        );


        alert(
            "全リセットが完了しました。"
        );


        // --------------------------------
        // 管理画面再取得
        // --------------------------------

        if (
            typeof loadCurrentSession ===
            "function"
        ) {

            await loadCurrentSession();
        }


        if (
            typeof loadParticipants ===
            "function"
        ) {

            await loadParticipants();
        }


        if (
            typeof loadRooms ===
            "function"
        ) {

            await loadRooms();
        }


        window.location.reload();

    } catch (error) {

        console.error(
            "全リセットエラー:",
            error
        );


        alert(
            error.message ||
            "全リセットに失敗しました。"
        );


        button.disabled =
            false;


        button.textContent =
            "⚠️ 全リセット";
    }
}


// ========================================
// 起動
// ========================================

setTimeout(
    createSessionControlArea,
    500
);