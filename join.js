// ========================================
// YP-Manager URL参加ページ v1.3.7
// 辞退・チャットのみ利用・状態復元統合版
// ========================================

const SUPABASE_URL =
    "https://ilmiebokwfccybrtduxy.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_tl-vkXmtiYn_f1VtPy689A_dwKCdYg5";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

let currentSessionId = null;
let currentEntry = null;
let lastEntryLookupError = null;
let lastSessionLookupError = null;
let pageBusy = false;


// ========================================
// HTML要素
// ========================================

const nameInput =
    document.getElementById("nameInput");

const joinButton =
    document.getElementById("joinButton");

let viewerButton =
    document.getElementById("viewerButton");

const cancelButton =
    document.getElementById("cancelButton");

const message =
    document.getElementById("message");


// ========================================
// URL参加者専用ID
// ========================================

function getUrlUserId() {

    let userId =
        localStorage.getItem("yp_url_user_id");

    if (!userId) {

        const uniqueId =
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        userId = `url-${uniqueId}`;

        localStorage.setItem(
            "yp_url_user_id",
            userId
        );
    }

    return userId;
}

const URL_USER_ID =
    getUrlUserId();


// ========================================
// チャットのみボタン
// ========================================

function ensureViewerButton() {

    if (
        !viewerButton &&
        joinButton &&
        joinButton.parentElement
    ) {

        viewerButton =
            joinButton.cloneNode(false);

        viewerButton.id =
            "viewerButton";

        viewerButton.type =
            "button";

        viewerButton.textContent =
            "💬 チャットのみ利用する";

        viewerButton.disabled =
            false;

        viewerButton.style.marginTop =
            "8px";

        joinButton.insertAdjacentElement(
            "afterend",
            viewerButton
        );
    }

    if (
        viewerButton &&
        viewerButton.dataset.ypViewerHandlerBound !== "true"
    ) {

        viewerButton.addEventListener(
            "click",
            joinAsViewer
        );

        viewerButton.dataset.ypViewerHandlerBound =
            "true";
    }
}


// ========================================
// メッセージ
// ========================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


function showMessage(
    text,
    type = ""
) {

    if (!message) {
        return;
    }

    message.className = type;
    message.innerHTML = text;
}


// ========================================
// 本人確認トークン
// ========================================

function getCancelToken(
    participantId
) {

    if (!participantId) {
        return null;
    }

    return localStorage.getItem(
        `yp_participant_cancel_token_${participantId}`
    );
}


async function ensureCancelToken(
    entry
) {

    if (!entry || !entry.id) {
        return null;
    }

    const existing =
        getCancelToken(entry.id);

    if (existing) {
        return existing;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "get_or_create_participant_cancel_token",
        {
            p_participant_id: entry.id,
            p_user_id: URL_USER_ID
        }
    );

    if (error) {

        console.error(
            "本人確認token取得エラー:",
            error
        );

        return null;
    }

    let token = null;

    if (typeof data === "string") {

        token = data;

    } else if (
        Array.isArray(data) &&
        data.length > 0
    ) {

        token =
            data[0]?.cancel_token ||
            data[0]?.token ||
            null;

    } else {

        token =
            data?.cancel_token ||
            data?.token ||
            null;
    }

    if (!token) {

        console.error(
            "本人確認tokenが返されませんでした:",
            data
        );

        return null;
    }

    localStorage.setItem(
        `yp_participant_cancel_token_${entry.id}`,
        token
    );

    return token;
}


// ========================================
// ボタン表示補助
// ========================================

function setDefaultButtonStyles() {

    if (!viewerButton) {
        return;
    }

    viewerButton.style.backgroundColor = "";
    viewerButton.style.color = "";
    viewerButton.style.borderColor = "";
    viewerButton.style.boxShadow = "";
}


function setViewerJoinButtonStyle() {

    if (!viewerButton) {
        return;
    }

    viewerButton.style.backgroundColor =
        "#2ecc71";

    viewerButton.style.color =
        "#ffffff";

    viewerButton.style.borderColor =
        "#27ae60";

    viewerButton.style.boxShadow =
        "0 2px 0 #27ae60";
}


function showCancelButton(text) {

    if (!cancelButton) {
        return;
    }

    cancelButton.disabled = false;
    cancelButton.textContent = text;
    cancelButton.classList.remove("hidden");
}


function hideCancelButton() {

    if (!cancelButton) {
        return;
    }

    cancelButton.disabled = false;
    cancelButton.textContent = "参加を辞退する";
    cancelButton.classList.add("hidden");
}


// ========================================
// 現在の配信IDを取得
// ========================================

async function loadCurrentSession() {

    lastSessionLookupError = null;

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("app_settings")
            .select("value")
            .eq("key", "current_session_id")
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data?.value) {

            currentSessionId = null;

            return false;
        }

        currentSessionId =
            String(data.value).trim();

        return Boolean(currentSessionId);

    } catch (error) {

        lastSessionLookupError = error;

        console.error(
            "現在配信取得エラー:",
            error
        );

        currentSessionId = null;

        return false;
    }
}


// ========================================
// 自分の有効な参加データを取得
// ========================================

async function getMyActiveEntry() {

    lastEntryLookupError = null;

    if (!currentSessionId) {
        return null;
    }

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("participants")
            .select("*")
            .eq("user_id", URL_USER_ID)
            .eq("session_id", currentSessionId)
            .in(
                "status",
                ["waiting", "viewer", "playing"]
            )
            .order(
                "joined_at",
                {
                    ascending: false
                }
            )
            .limit(1);

        if (error) {
            throw error;
        }

        currentEntry =
            data?.[0] || null;

        return currentEntry;

    } catch (error) {

        lastEntryLookupError = error;
        currentEntry = null;

        console.error(
            "参加状態確認エラー:",
            error
        );

        return null;
    }
}


// 後方互換用
async function getMyWaitingEntry() {

    return await getMyActiveEntry();
}


// ========================================
// 待ち順位
// ========================================

async function getCurrentPosition(
    entry
) {
    if (!currentSessionId || !entry) {
        return null;
    }

    if (window.YPQueueRules) {
        await window.YPQueueRules.refreshHostName(supabaseClient);
        if (!window.YPQueueRules.isMainWaitingCandidate(entry)) {
            return "-";
        }
    } else if (entry.room_id) {
        return "-";
    }

    const { data, error } = await supabaseClient
        .from("participants")
        .select("id, name, source, status, display_order, joined_at, first_participation_pending, note, room_id, chat_only, lobby_state")
        .eq("session_id", currentSessionId)
        .eq("status", "waiting")
        .is("room_id", null)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("joined_at", { ascending: true });

    if (error || !data) {
        return entry.display_order ?? "?";
    }

    const sorted = window.YPQueueRules
        ? window.YPQueueRules.sortMainWaiting(data)
        : data.filter(person => !isChatOnlyEntry(person));

    const index = sorted.findIndex(person => person.id === entry.id);
    return index < 0
        ? "-"
        : index + 1;
}

// ========================================
// 状態判定
// ========================================

function isChatOnlyEntry(entry) {

    return Boolean(
        entry &&
        entry.status === "viewer" &&
        entry.lobby_state !== "watching"
    );
}


function isWatchingEntry(entry) {

    return Boolean(
        entry &&
        (
            entry.lobby_state === "watching" ||
            (
                entry.status === "viewer" &&
                entry.lobby_state !== "chat_only" &&
                entry.note !== "viewer"
            )
        )
    );
}


// ========================================
// 状態別画面
// ========================================

async function showWaitingState(entry) {

    ensureViewerButton();

    const position =
        await getCurrentPosition(entry);

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "🎮 待機列に参加中";
    }

    if (viewerButton) {

        viewerButton.disabled = false;

        viewerButton.textContent =
            "💬 チャットのみ利用する";

        setDefaultButtonStyles();
    }

    showCancelButton(
        "参加を辞退する"
    );

    showMessage(
        `参加受付済みです！<br><br>
        現在の待ち順は
        <strong>${escapeHtml(position)}番</strong>
        です。`,
        "success"
    );
}


function showPlayingState(entry) {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "🎮 ロビー参加中";
    }

    if (viewerButton) {

        viewerButton.disabled = false;

        viewerButton.textContent =
            "💬 チャットのみ利用する";

        setDefaultButtonStyles();
    }

    showCancelButton(
        "参加を辞退する"
    );

    showMessage(
        "メインロビーに参加中です。<br>" +
        "退出する場合は「参加を辞退する」を押してください。",
        "success"
    );
}


function showWatchingState(entry) {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "👀 ロビー観戦中";
    }

    if (viewerButton) {

        viewerButton.disabled = false;

        viewerButton.textContent =
            "💬 チャットのみ利用する";

        setDefaultButtonStyles();
    }

    showCancelButton(
        "観戦を辞退する"
    );

    showMessage(
        "メインロビーで観戦中です。<br>" +
        "退出する場合は「観戦を辞退する」を押してください。",
        "success"
    );
}


function showViewerState(entry) {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "🎮 待機列には参加していません";
    }

    if (viewerButton) {

        viewerButton.disabled = false;

        viewerButton.textContent =
            "🎮 待機列に参加する";

        setViewerJoinButtonStyle();
    }

    showCancelButton(
        "チャットのみ利用を終了"
    );

    showMessage(
        "チャットのみ利用中です。<br>" +
        "待機列には参加していません。<br>" +
        "待機列に戻る場合は「待機列に参加する」を押してください。",
        "success"
    );
}


function showJoinState() {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = false;
    }

    if (joinButton) {

        joinButton.disabled = false;

        joinButton.textContent =
            "🎮 待機列に参加する";
    }

    if (viewerButton) {

        viewerButton.disabled = false;

        viewerButton.textContent =
            "💬 チャットのみ利用する";

        setDefaultButtonStyles();
    }

    hideCancelButton();
}


// 検索に失敗した場合は未参加扱いにしない
function showStateLookupProblem() {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {
        joinButton.disabled = true;
    }

    if (viewerButton) {
        viewerButton.disabled = true;
    }

    if (cancelButton) {

        cancelButton.disabled = true;

        cancelButton.textContent =
            "参加状態を確認できません";

        cancelButton.classList.remove("hidden");
    }

    showMessage(
        "参加状態を確認できませんでした。<br>" +
        "通信状態を確認して、ページを再読み込みしてください。<br>" +
        "登録状態が不明なため、未参加扱いには変更していません。",
        "error"
    );
}


function showNoSessionState() {

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "現在受付していません";
    }

    if (viewerButton) {

        viewerButton.disabled = true;

        viewerButton.textContent =
            "💬 チャットのみ利用する";
    }

    hideCancelButton();

    showMessage(
        "現在、参加受付中の配信を確認できませんでした。<br>" +
        "配信開始後にページを再読み込みしてください。",
        "info"
    );
}


// ========================================
// 更新後の参加者情報を取得
// ========================================

async function fetchParticipantById(
    participantId
) {

    const {
        data,
        error
    } = await supabaseClient
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .eq("session_id", currentSessionId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
}


// ========================================
// 本人確認token付きRPC
// ========================================

async function callParticipantRpc(
    rpcName,
    entry
) {

    const token =
        getCancelToken(entry?.id) ||
        await ensureCancelToken(entry);

    if (!token) {

        throw new Error(
            "本人確認トークンを取得できませんでした。ページを再読み込みしてください。"
        );
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        rpcName,
        {
            p_participant_id: entry.id,
            p_cancel_token: token
        }
    );

    if (error) {
        throw error;
    }

    console.log(
        `[YP-Manager] ${rpcName} RPC結果:`,
        data
    );

    const latest =
        await fetchParticipantById(entry.id);

    if (!latest) {

        throw new Error(
            "更新後の参加者情報を確認できませんでした。"
        );
    }

    return latest;
}


// ========================================
// 待機列の次の順番
// ========================================

async function getNextDisplayOrder(
    excludeId = null,
    rejoin = false
) {

    let query =
        supabaseClient
            .from("participants")
            .select("display_order")
            .eq("session_id", currentSessionId)
            .eq("status", "waiting")
            .is("room_id", null);

    if (excludeId) {

        query =
            query.neq(
                "id",
                excludeId
            );
    }

    const {
        data,
        error
    } = await query;

    if (error) {
        throw error;
    }

    const values =
        (data || [])
            .map(
                row => Number(row.display_order)
            )
            .filter(
                value =>
                    Number.isFinite(value) &&
                    (
                        rejoin
                            ? value >= 1000000
                            : value < 1000000
                    )
            );

    if (rejoin) {

        return values.length
            ? Math.max(...values) + 1
            : 1000000;
    }

    return values.length
        ? Math.max(...values) + 1
        : 1;
}


// ========================================
// 待機列に参加する
// ========================================

async function joinQueue() {

    if (pageBusy) {
        return;
    }

    pageBusy = true;

    try {

        if (!(await loadCurrentSession())) {

            if (lastSessionLookupError) {
                showStateLookupProblem();
            } else {
                showNoSessionState();
            }

            return;
        }

        const entry =
            await getMyActiveEntry();

        if (lastEntryLookupError) {

            showStateLookupProblem();

            return;
        }

        if (entry) {

            if (entry.status === "playing") {

                if (isWatchingEntry(entry)) {
                    showWatchingState(entry);
                } else {
                    showPlayingState(entry);
                }

                return;
            }

            if (entry.status === "waiting") {

                await showWaitingState(entry);

                return;
            }

            if (isChatOnlyEntry(entry)) {

                const updated =
                    await callParticipantRpc(
                        "return_url_participant_to_queue",
                        entry
                    );

                if (updated.status !== "waiting") {

                    throw new Error(
                        "待機列への復帰を確認できませんでした。"
                    );
                }

                await ensureCancelToken(updated);

                currentEntry = updated;

                await showWaitingState(updated);

                showMessage(
                    "待機列に戻りました！順番どおりにお待ちください。",
                    "success"
                );

                return;
            }

            if (
                entry.status === "viewer" &&
                isWatchingEntry(entry)
            ) {

                showWatchingState(entry);

                return;
            }
        }

        const name =
            (nameInput?.value || "").trim();

        if (!name) {

            showMessage(
                "名前を入力してください。",
                "error"
            );

            return;
        }

        if (name.length > 30) {

            showMessage(
                "名前は30文字以内にしてください。",
                "error"
            );

            return;
        }

        if (joinButton) {

            joinButton.disabled = true;

            joinButton.textContent =
                "送信中…";
        }

        if (viewerButton) {
            viewerButton.disabled = true;
        }

        const displayOrder =
            await getNextDisplayOrder();

        const {
            data,
            error
        } = await supabaseClient
            .from("participants")
            .insert([{
                name,
                status: "waiting",
                lobby_state: "waiting",
                source: "url",
                user_id: URL_USER_ID,
                display_order: displayOrder,
                note: null,
                room_id: null,
                session_id: currentSessionId
            }])
            .select();

        if (error) {
            throw error;
        }

        if (!data?.length) {

            throw new Error(
                "参加登録結果を確認できませんでした。"
            );
        }

        if (nameInput) {
            nameInput.value = "";
        }

        await ensureCancelToken(data[0]);

        currentEntry = data[0];

        await showWaitingState(data[0]);

    } catch (error) {

        console.error(
            "待機列参加エラー:",
            error
        );

        showMessage(
            `待機列に参加できませんでした。<br>${escapeHtml(error?.message || "原因不明のエラー")}`,
            "error"
        );

        if (joinButton) {
            joinButton.disabled = false;
        }

        if (viewerButton) {
            viewerButton.disabled = false;
        }

    } finally {

        pageBusy = false;
    }
}


// ========================================
// チャットのみ利用
// ========================================

async function joinAsViewer() {

    if (pageBusy) {
        return;
    }

    pageBusy = true;

    try {

        if (!(await loadCurrentSession())) {

            if (lastSessionLookupError) {
                showStateLookupProblem();
            } else {
                showNoSessionState();
            }

            return;
        }

        const entry =
            await getMyActiveEntry();

        if (lastEntryLookupError) {

            showStateLookupProblem();

            return;
        }

        // チャットのみから待機列へ復帰
        if (isChatOnlyEntry(entry)) {

            const updated =
                await callParticipantRpc(
                    "return_url_participant_to_queue",
                    entry
                );

            if (updated.status !== "waiting") {

                throw new Error(
                    "待機列への復帰を確認できませんでした。"
                );
            }

            await ensureCancelToken(updated);

            currentEntry = updated;

            await showWaitingState(updated);

            showMessage(
                "待機列に戻りました！順番どおりにお待ちください。",
                "success"
            );

            return;
        }

        // 登録済みの人をチャットのみ利用へ切り替える
        if (
            entry &&
            ["waiting", "playing", "viewer"]
                .includes(entry.status)
        ) {

            if (!confirm(
                "待機列またはメインロビーから退出して、チャットのみ利用に切り替えますか？"
            )) {
                return;
            }

            if (viewerButton) {

                viewerButton.disabled = true;

                viewerButton.textContent =
                    "切替中…";
            }

            if (joinButton) {
                joinButton.disabled = true;
            }

            const updated =
                await callParticipantRpc(
                    "set_url_participant_chat_only",
                    entry
                );

                        if (
                updated.status !== "viewer" ||
                !isChatOnlyEntry(updated)
            ) {

                throw new Error(
                    "チャットのみ利用への切り替えを確認できませんでした。"
                );
            }

            await ensureCancelToken(updated);

            currentEntry = updated;

            showViewerState(updated);

            showMessage(
                "チャットのみ利用に切り替えました。メインロビー／待機列から退出しています。",
                "success"
            );

            return;
        }

        // 新規のチャットのみ利用
        const name =
            (nameInput?.value || "").trim();

        if (!name) {

            showMessage(
                "初めてチャットのみ利用する場合は、先に名前を入力してください。",
                "error"
            );

            return;
        }

        if (name.length > 30) {

            showMessage(
                "名前は30文字以内にしてください。",
                "error"
            );

            return;
        }

        if (viewerButton) {

            viewerButton.disabled = true;

            viewerButton.textContent =
                "登録中…";
        }

        if (joinButton) {
            joinButton.disabled = true;
        }

        const {
            data,
            error
        } = await supabaseClient
            .from("participants")
            .insert([{
                name,
                status: "viewer",
                lobby_state: "chat_only",
                source: "url",
                user_id: URL_USER_ID,
                display_order: null,
                note: "viewer",
                room_id: null,
                session_id: currentSessionId
            }])
            .select();

        if (error) {
            throw error;
        }

        if (!data?.length) {

            throw new Error(
                "チャットのみ利用の登録結果を確認できませんでした。"
            );
        }

        await ensureCancelToken(data[0]);

        currentEntry = data[0];

        showViewerState(data[0]);

        showMessage(
            "チャットのみ利用中です。待機列には参加していません。",
            "success"
        );

    } catch (error) {

        console.error(
            "チャットのみ利用切替エラー:",
            error
        );

        showMessage(
            `チャットのみ利用に切り替えられませんでした。<br>${escapeHtml(error?.message || "原因不明のエラー")}`,
            "error"
        );

        if (joinButton) {
            joinButton.disabled = false;
        }

        if (viewerButton) {
            viewerButton.disabled = false;
        }

    } finally {

        pageBusy = false;
    }
}


// ========================================
// 辞退する / チャットのみ利用を終了
// ========================================

async function cancelQueue() {

    if (pageBusy) {
        return;
    }

    pageBusy = true;

    let entry = null;

    try {

        if (!(await loadCurrentSession())) {

            if (lastSessionLookupError) {
                showStateLookupProblem();
            } else {
                showNoSessionState();
            }

            return;
        }

        entry =
            await getMyActiveEntry();

        if (lastEntryLookupError) {

            showStateLookupProblem();

            return;
        }

        if (!entry) {

            currentEntry = null;

            showJoinState();

            showMessage(
                "有効な参加情報が見つかりません。すでに辞退済みの可能性があります。",
                "info"
            );

            return;
        }

        const chatOnly =
            isChatOnlyEntry(entry);

        const watching =
            isWatchingEntry(entry);

        const prompt =
            chatOnly
                ? "チャットのみ利用を終了しますか？"
                : watching
                    ? "観戦を辞退してロビーから退出しますか？"
                    : entry.status === "playing"
                        ? "メインロビーから退出して参加を辞退しますか？"
                        : "参加を辞退しますか？";

        if (!confirm(prompt)) {
            return;
        }

        if (cancelButton) {

            cancelButton.disabled = true;

            cancelButton.textContent =
                "処理中…";
        }

        if (joinButton) {
            joinButton.disabled = true;
        }

        if (viewerButton) {
            viewerButton.disabled = true;
        }

        // 本人確認トークン付きの辞退RPCを呼ぶ
        const updated =
            await callParticipantRpc(
                "cancel_url_queue",
                entry
            );

        if (
            updated.status !== "cancelled" ||
            updated.lobby_state === "playing" ||
            updated.lobby_state === "watching"
        ) {

            throw new Error(
                "辞退後の状態をデータベース上で確認できませんでした。"
            );
        }

        localStorage.removeItem(
            `yp_participant_cancel_token_${entry.id}`
        );

        currentEntry = null;

        showJoinState();

        showMessage(
            chatOnly
                ? "チャットのみ利用を終了しました。"
                : "参加を辞退しました。<br>また参加したくなったら、もう一度受付できます。",
            "info"
        );

    } catch (error) {

        console.error(
            "辞退処理エラー:",
            error
        );

        showMessage(
            `処理に失敗しました。<br>${escapeHtml(error?.message || "原因不明のエラー")}`,
            "error"
        );

        // 失敗時には画面だけ未参加状態にしない
        if (entry) {

            if (isChatOnlyEntry(entry)) {

                showViewerState(entry);

            } else if (isWatchingEntry(entry)) {

                showWatchingState(entry);

            } else if (entry.status === "playing") {

                showPlayingState(entry);

            } else {

                await showWaitingState(entry);
            }

        } else if (lastEntryLookupError || lastSessionLookupError) {

            showStateLookupProblem();
        }

    } finally {

        if (
            cancelButton &&
            !cancelButton.classList.contains("hidden")
        ) {

            if (
                lastEntryLookupError ||
                lastSessionLookupError
            ) {

                cancelButton.disabled = true;

                cancelButton.textContent =
                    "参加状態を確認できません";

            } else {

                cancelButton.disabled = false;

                if (currentEntry) {

                    cancelButton.textContent =
                        isChatOnlyEntry(currentEntry)
                            ? "チャットのみ利用を終了"
                            : isWatchingEntry(currentEntry)
                                ? "観戦を辞退する"
                                : "参加を辞退する";
                }
            }
        }

        pageBusy = false;
    }
}


// ========================================
// ページ起動時の状態復元
// ========================================

async function initialize() {

    ensureViewerButton();

    if (nameInput) {
        nameInput.disabled = true;
    }

    if (joinButton) {

        joinButton.disabled = true;

        joinButton.textContent =
            "確認中…";
    }

    if (viewerButton) {

        viewerButton.disabled = true;

        viewerButton.textContent =
            "確認中…";
    }

    showMessage(
        "現在の参加受付を確認しています…",
        ""
    );

    if (!(await loadCurrentSession())) {

        if (lastSessionLookupError) {
            showStateLookupProblem();
        } else {
            showNoSessionState();
        }

        return;
    }

    const entry =
        await getMyActiveEntry();

    if (lastEntryLookupError) {

        showStateLookupProblem();

        return;
    }

    currentEntry = entry;

    if (!entry) {

        showJoinState();

        showMessage(
            "",
            ""
        );

        return;
    }

    // token取得に失敗しても登録状態の表示は維持する
    const token =
        await ensureCancelToken(entry);

    if (!token) {

        console.warn(
            "本人確認tokenを取得できませんでした。操作時に再取得を試みます。"
        );
    }

    if (isChatOnlyEntry(entry)) {

        showViewerState(entry);

    } else if (isWatchingEntry(entry)) {

        showWatchingState(entry);

    } else if (entry.status === "playing") {

        showPlayingState(entry);

    } else {

        await showWaitingState(entry);
    }
}


// ========================================
// イベント登録
// ========================================

ensureViewerButton();

if (joinButton) {

    joinButton.addEventListener(
        "click",
        joinQueue
    );
}

if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        cancelQueue
    );
}

if (nameInput) {

    nameInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                event.preventDefault();

                if (!joinButton?.disabled) {
                    joinQueue();
                }
            }
        }
    );
}


// ========================================
// 起動
// ========================================

initialize();
