/* =====================================
   YP-Manager 共通のメイン待機列ルール
===================================== */
(function () {
    "use strict";

    const HOST_SETTING_KEY = "main_lobby_host_name";

    // 配信者本人のYouTube ID
    const EXCLUDED_HOST_USER_IDS = new Set([
        "yt-UCVOZmByIHyBrI8Q7QGa_GDA"
    ]);

    const HOST_CACHE_KEY = "yp_manager_main_lobby_host_name_cache";
    const HOST_CACHE_AT_KEY = "yp_manager_main_lobby_host_name_cache_at";
    const HOST_CACHE_TTL_MS = 30 * 1000;

    let hostName = "";
    let hostCacheAt = 0;
    let hostRefreshPromise = null;

    try {
        hostName = String(localStorage.getItem(HOST_CACHE_KEY) || "").trim();
        hostCacheAt = Number(localStorage.getItem(HOST_CACHE_AT_KEY) || 0);
    } catch (_) {}

    function normalizeName(value) {
        return String(value || "")
            .normalize("NFKC")
            .trim()
            .replace(/^@+/, "")
            .replace(/[\s\u3000]+/g, "")
            .toLocaleLowerCase("ja-JP");
    }

    function setHostName(value) {
        hostName = String(value == null ? "" : value).trim();
        hostCacheAt = Date.now();

        try {
            localStorage.setItem(HOST_CACHE_KEY, hostName);
            localStorage.setItem(HOST_CACHE_AT_KEY, String(hostCacheAt));
        } catch (_) {}
    }

    async function refreshHostName(supabaseClient, force) {
        if (!supabaseClient || typeof supabaseClient.from !== "function") {
            return hostName;
        }

        if (
            !force &&
            hostCacheAt &&
            Date.now() - hostCacheAt < HOST_CACHE_TTL_MS
        ) {
            return hostName;
        }

        if (hostRefreshPromise) return hostRefreshPromise;

        hostRefreshPromise = (async function () {
            try {
                const { data, error } = await supabaseClient
                    .from("app_settings")
                    .select("value")
                    .eq("key", HOST_SETTING_KEY)
                    .maybeSingle();

                if (error) throw error;

                setHostName(data?.value ?? "");

            } catch (error) {
                console.warn(
                    "[YP-Manager] 配信者名取得エラー:",
                    error
                );
            } finally {
                hostRefreshPromise = null;
            }

            return hostName;
        })();

        return hostRefreshPromise;
    }

    function isExcludedHostUser(person) {
        const userId = String(person?.user_id || "").trim();
        return EXCLUDED_HOST_USER_IDS.has(userId);
    }

    function isHost(person, explicitHostName) {
        if (isExcludedHostUser(person)) return true;

        const comparisonName =
            explicitHostName == null
                ? hostName
                : String(explicitHostName);

        const normalizedHost = normalizeName(comparisonName);

        return Boolean(
            normalizedHost &&
            normalizeName(person?.name) === normalizedHost
        );
    }

    function isChatOnlyPerson(person) {
        if (!person) return false;

        const status = String(person.status || "").trim().toLowerCase();
        const lobbyState = String(person.lobby_state || "").trim().toLowerCase();
        const source = String(person.source || "").trim().toLowerCase();
        const note = String(person.note || "").trim().toLowerCase();

        if (
            person.chat_only === true ||
            status === "chat_only" ||
            lobbyState === "chat_only" ||
            source === "chat" ||
            note === "chat_only"
        ) {
            return true;
        }

        return (
            status === "viewer" &&
            note === "viewer" &&
            lobbyState !== "watching"
        );
    }

    function isMainWaitingCandidate(person, explicitHostName) {
        const roomId = person?.room_id;

        const hasRoom =
            roomId !== null &&
            roomId !== undefined &&
            String(roomId).trim() !== "";

        return Boolean(
            person &&
            person.status === "waiting" &&
            !hasRoom &&
            !isExcludedHostUser(person) &&
            !isChatOnlyPerson(person) &&
            !isHost(person, explicitHostName)
        );
    }

    function isFirstParticipationPending(person) {
        return Boolean(
            person && (
                person.first_participation_pending === true ||
                (
                    person.first_participation_pending == null &&
                    person.note === "initial"
                )
            )
        );
    }

    function orderCompare(a, b) {
        const aValue = a?.display_order;
        const bValue = b?.display_order;

        const aHasOrder =
            aValue !== null &&
            aValue !== undefined &&
            String(aValue).trim() !== "" &&
            Number.isFinite(Number(aValue));

        const bHasOrder =
            bValue !== null &&
            bValue !== undefined &&
            String(bValue).trim() !== "" &&
            Number.isFinite(Number(bValue));

        if (
            aHasOrder &&
            bHasOrder &&
            Number(aValue) !== Number(bValue)
        ) {
            return Number(aValue) - Number(bValue);
        }

        if (aHasOrder && !bHasOrder) return -1;
        if (!aHasOrder && bHasOrder) return 1;

        const joinedCompare =
            String(a?.joined_at || "").localeCompare(
                String(b?.joined_at || "")
            );

        if (joinedCompare !== 0) return joinedCompare;

        return String(a?.id || "").localeCompare(
            String(b?.id || "")
        );
    }

    function sortMainWaiting(people, explicitHostName) {
        return (Array.isArray(people) ? people : [])
            .filter(person =>
                isMainWaitingCandidate(person, explicitHostName)
            )
            .sort((a, b) => {
                const aNew = isFirstParticipationPending(a) ? 0 : 1;
                const bNew = isFirstParticipationPending(b) ? 0 : 1;

                if (aNew !== bNew) return aNew - bNew;

                return orderCompare(a, b);
            });
    }

    window.YPQueueRules = {
        getHostName: () => hostName,
        setHostName,
        refreshHostName,
        isChatOnlyPerson,
        isExcludedHostUser,
        isHost,
        isMainWaitingCandidate,
        isFirstParticipationPending,
        orderCompare,
        sortMainWaiting
    };
})();