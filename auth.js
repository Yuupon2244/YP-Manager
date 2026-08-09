// ========================================
// YP-Manager 管理者認証 v0.1
// ========================================


// ========================================
// 状態
// ========================================

let ypCurrentUser = null;
let ypAdminProfile = null;


// ========================================
// ログイン画面を生成
// ========================================

function createAuthOverlay() {

    // 重複防止
    if (
        document.getElementById(
            "ypAuthOverlay"
        )
    ) {
        return;
    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "ypAuthOverlay";


    overlay.style.position =
        "fixed";

    overlay.style.inset =
        "0";

    overlay.style.zIndex =
        "99999";

    overlay.style.background =
        "#1f1f1f";

    overlay.style.display =
        "flex";

    overlay.style.alignItems =
        "center";

    overlay.style.justifyContent =
        "center";

    overlay.style.padding =
        "20px";


    overlay.innerHTML = `
        <div
            style="
                width: 100%;
                max-width: 430px;
                background: #2b2b2b;
                border-radius: 18px;
                padding: 28px;
                box-shadow: 0 10px 35px rgba(0,0,0,.35);
            "
        >

            <div
                style="
                    font-size: 28px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    text-align: center;
                "
            >
                🎮 YP-Manager
            </div>


            <div
                style="
                    color: #bbb;
                    text-align: center;
                    margin-bottom: 24px;
                "
            >
                管理者ログイン
            </div>


            <input
                id="ypAuthEmail"
                type="email"
                autocomplete="username"
                placeholder="メールアドレス"
                style="
                    width: 100%;
                    padding: 14px;
                    margin-bottom: 12px;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                "
            >


            <input
                id="ypAuthPassword"
                type="password"
                autocomplete="current-password"
                placeholder="パスワード"
                style="
                    width: 100%;
                    padding: 14px;
                    margin-bottom: 14px;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                "
            >


            <button
                id="ypAuthLoginButton"
                type="button"
                style="
                    width: 100%;
                    min-height: 50px;
                    border: none;
                    border-radius: 10px;
                    background: #39b54a;
                    color: white;
                    font-size: 17px;
                    font-weight: bold;
                    cursor: pointer;
                "
            >
                ログイン
            </button>


            <div
                id="ypAuthMessage"
                style="
                    min-height: 22px;
                    margin-top: 14px;
                    text-align: center;
                    color: #ffcf5c;
                    font-size: 14px;
                "
            >
            </div>

        </div>
    `;


    document.body.appendChild(
        overlay
    );


    const loginButton =
        document.getElementById(
            "ypAuthLoginButton"
        );


    const passwordInput =
        document.getElementById(
            "ypAuthPassword"
        );


    loginButton.addEventListener(
        "click",
        loginOwner
    );


    passwordInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                loginButton.click();
            }
        }
    );
}


// ========================================
// ログイン画面表示
// ========================================

function showAuthOverlay() {

    createAuthOverlay();


    const overlay =
        document.getElementById(
            "ypAuthOverlay"
        );


    if (overlay) {

        overlay.style.display =
            "flex";
    }
}


// ========================================
// ログイン画面非表示
// ========================================

function hideAuthOverlay() {

    const overlay =
        document.getElementById(
            "ypAuthOverlay"
        );


    if (overlay) {

        overlay.style.display =
            "none";
    }
}


// ========================================
// メッセージ
// ========================================

function setAuthMessage(
    text,
    isError = false
) {

    const message =
        document.getElementById(
            "ypAuthMessage"
        );


    if (!message) {
        return;
    }


    message.textContent =
        text;


    message.style.color =
        isError
            ? "#ff7979"
            : "#ffcf5c";
}


// ========================================
// 管理者情報取得
// ========================================

async function loadAdminProfile(
    userId
) {

    if (!userId) {
        return null;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "admin_users"
            )
            .select(
                "user_id, role, display_name"
            )
            .eq(
                "user_id",
                userId
            )
            .maybeSingle();


    if (error) {

        console.error(
            "管理者情報取得エラー:",
            error
        );

        return null;
    }


    return data || null;
}


// ========================================
// Ownerログイン
// ========================================

async function loginOwner() {

    const emailInput =
        document.getElementById(
            "ypAuthEmail"
        );


    const passwordInput =
        document.getElementById(
            "ypAuthPassword"
        );


    const loginButton =
        document.getElementById(
            "ypAuthLoginButton"
        );


    const email =
        emailInput
            .value
            .trim();


    const password =
        passwordInput
            .value;


    if (
        !email ||
        !password
    ) {

        setAuthMessage(
            "メールアドレスとパスワードを入力してください。",
            true
        );

        return;
    }


    loginButton.disabled =
        true;


    loginButton.textContent =
        "ログイン中…";


    setAuthMessage(
        ""
    );


    const {
        data,
        error
    } =
        await supabaseClient
            .auth
            .signInWithPassword({
                email,
                password
            });


    if (error) {

        console.error(
            "ログインエラー:",
            error
        );


        setAuthMessage(
            "ログインできませんでした。",
            true
        );


        loginButton.disabled =
            false;


        loginButton.textContent =
            "ログイン";


        return;
    }


    const user =
        data.user;


    const profile =
        await loadAdminProfile(
            user.id
        );


    if (
        !profile ||
        profile.role !==
            "owner"
    ) {

        setAuthMessage(
            "このアカウントにはOwner権限がありません。",
            true
        );


        await supabaseClient
            .auth
            .signOut({
                scope: "local"
            });


        loginButton.disabled =
            false;


        loginButton.textContent =
            "ログイン";


        return;
    }


    ypCurrentUser =
        user;


    ypAdminProfile =
        profile;


    hideAuthOverlay();


    renderOwnerBadge();
}


// ========================================
// Owner表示
// ========================================

function renderOwnerBadge() {

    let badge =
        document.getElementById(
            "ypOwnerBadge"
        );


    if (!badge) {

        badge =
            document.createElement(
                "div"
            );


        badge.id =
            "ypOwnerBadge";


        badge.style.margin =
            "0 0 18px";

        badge.style.padding =
            "10px 12px";

        badge.style.background =
            "#363636";

        badge.style.borderRadius =
            "10px";

        badge.style.fontSize =
            "14px";


        const container =
            document.querySelector(
                ".container"
            );


        if (container) {

            container.insertBefore(
                badge,
                container.firstChild
            );
        }
    }


    const displayName =
        ypAdminProfile
            ?.display_name ||
        "Owner";


    badge.innerHTML = `
        <span>
            🔐 ${displayName} / Owner
        </span>

        <button
            id="ypLogoutButton"
            type="button"
            style="
                float: right;
                border: none;
                border-radius: 7px;
                padding: 5px 9px;
                cursor: pointer;
            "
        >
            ログアウト
        </button>
    `;


    document
        .getElementById(
            "ypLogoutButton"
        )
        .addEventListener(
            "click",
            logoutOwner
        );
}


// ========================================
// ログアウト
// ========================================

async function logoutOwner() {

    await supabaseClient
        .auth
        .signOut({
            scope:
                "local"
        });


    ypCurrentUser =
        null;


    ypAdminProfile =
        null;


    const badge =
        document.getElementById(
            "ypOwnerBadge"
        );


    if (badge) {

        badge.remove();
    }


    showAuthOverlay();
}


// ========================================
// 現在セッション確認
// ========================================

async function checkInitialAuth() {

    showAuthOverlay();


    setAuthMessage(
        "ログイン状態を確認中…"
    );


    const {
        data,
        error
    } =
        await supabaseClient
            .auth
            .getSession();


    if (error) {

        console.error(
            "セッション確認エラー:",
            error
        );


        setAuthMessage(
            "ログイン状態を確認できませんでした。",
            true
        );

        return;
    }


    const session =
        data.session;


    if (
        !session ||
        !session.user
    ) {

        setAuthMessage(
            ""
        );

        return;
    }


    const profile =
        await loadAdminProfile(
            session.user.id
        );


    if (
        !profile ||
        profile.role !==
            "owner"
    ) {

        await supabaseClient
            .auth
            .signOut({
                scope:
                    "local"
            });


        setAuthMessage(
            "Owner権限のあるアカウントでログインしてください。",
            true
        );

        return;
    }


    ypCurrentUser =
        session.user;


    ypAdminProfile =
        profile;


    hideAuthOverlay();


    renderOwnerBadge();
}


// ========================================
// Auth状態変化
// ========================================

supabaseClient
    .auth
    .onAuthStateChange(
        (
            event,
            session
        ) => {

            if (
                event ===
                "SIGNED_OUT"
            ) {

                ypCurrentUser =
                    null;

                ypAdminProfile =
                    null;


                showAuthOverlay();
            }
        }
    );


// ========================================
// 起動
// ========================================

checkInitialAuth();