/* ===========================
   designExplorer.js (full, folders under /data + ?PROJECT=)
   =========================== */

/* ========= Base page helpers ========= */

function unloadPageContent() {
    overwriteInitialGlobalValues();

    d3.select("div.legend").selectAll("*").remove();

    d3.select("#inputSliders").selectAll("*").remove();
    d3.select("#inputSliders").append("form").attr("class", "sliders");

    d3.select("div#graph").selectAll("*").remove();
    d3.select("div#radarChart").selectAll("*").remove();

    d3.select("div#thumbnails-btm_container")
        .select("div#sorting")
        .selectAll("*")
        .remove();
    d3.select("div#thumbnails-btm_container").select("div#sorting").text("");
    d3.select("div#thumbnails-btm_container")
        .select("div#thumbnails-btm")
        .selectAll("*")
        .remove();

    d3.select("div#thumbnails-side_container")
        .select("div#sorting")
        .selectAll("*")
        .remove();
    d3.select("div#thumbnails-side_container").select("div#sorting").text("");
    d3.select("div#thumbnails-side_container")
        .select("div#thumbnails-side")
        .selectAll("*")
        .remove();

    d3.select("div#zoomed").selectAll("*").remove();
    d3.select("div#viewer3d").selectAll("*").remove();
}

function calWidthAndHeight() {
    (windowWidth = window.innerWidth),
        (windowHeight = window.innerHeight),
        (cleanHeight = windowHeight - 115),
        (cleanWidth = windowWidth - 100),
        (graphHeight = cleanHeight / 3 - 24),
        (zoomedHeight = (cleanHeight * 2) / 3);
}

function overwriteInitialGlobalValues() {
    originalData = "";
    cleanedData = [];
    (numericalData = []), (inputData = []);
    outputData = [];
    slidersInfo = [];
    currentSliderValues = {};
    allDataCollector = {};
    slidersMapping = {};
    ids = [];
    cleanedKeys4pc = {};
    googleFolderLink = "";

    inputDataKeys = [];
    outputDataKeys = [];
    imageLinkKeys = [];

    _userSetting = {
        studyInfo: { name: "", date: "" },
        dimScales: {},
        dimTicks: {},
        dimMark: {},
    };

    rcheight = height = d3.select("#graph").style("height").replace("px", "");
    selectedDataFormatted = [];
    firstRating = true;

    calWidthAndHeight();

    pcHeight = d3.select("#graph").style("height").replace("px", "");
    d3.selectAll(".zoomed").style("height", "0px");
    d3.select("#thumbnails-btm_container").style("height", zoomedHeight + "px");

    currentView = "2D";
    d3.select("input#toggleView").property("checked", "true");

    initit3DViewer = true;
    d3.select("#zoomed").classed("hidden", false);
    d3.select("#viewer3d").classed("hidden", true);
}

/* ========= URL helpers ========= */

function getUrlVars(rawUrl) {
    var vars = {};
    rawUrl.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (_m, key, value) {
        vars[key] = value;
    });
    return vars;
}
function getQueryParam(name) {
    var v = getUrlVars(window.location.href)[name];
    return v ? decodeURIComponent(v) : undefined;
}
function encodeUrl(url) {
    return btoa(url);
}
function decodeUrl(encodedString) {
    var url = "";
    try {
        url = atob(encodedString);
    } catch (err) {
        console.log(err.message + " But fixed:>");
        url = atob(encodedString.replace("_", "/").replace("-", "+") + "=");
    }
    return url;
}

/* ========= Config & globals ========= */

/** Per Drive (se mai lo userai ancora). Non serve per /data/<PROJECT> */
var Gkey = "AIza...YOUR_KEY_IF_YOU_STILL_USE_DRIVE...";

/** Collettore globale (Drive/OneDrive) */
var _googleReturnObj = {
    csvFiles: {},
    imgFiles: {},
    jsonFiles: {},
    settingFiles: {},
};

/** Base URL degli asset (per cartella progetto) */
var DE_ASSET_BASE = ""; // tipo: https://acpvarchitects.github.io/CVP.App.DesignExplorer/data/MOX/

/** Ricava la base della app (es: https://acpvarchitects.github.io/CVP.App.DesignExplorer/) */
function computeAppBase() {
    // rimuove eventuale file/segmento finale, garantendo trailing slash
    var p = window.location.pathname;
    // se termina con '/', va bene così; altrimenti togli l'ultimo segmento
    if (!/\/$/.test(p)) p = p.replace(/\/[^\/]*$/, "/");
    return window.location.origin + p;
}

/** Costruisce l’URL della cartella progetto sotto /data */
function buildProjectFolderUrl(projectCode) {
    var base = computeAppBase();
    return (
        base.replace(/\/+$/, "") +
        "/data/" +
        encodeURIComponent(projectCode) +
        "/"
    );
}

/** Risolve URL immagine: se nel CSV c'è "img_001.jpg", prepend DE_ASSET_BASE */
function deResolveAssetUrl(nameOrUrl) {
    if (!nameOrUrl) return null;
    if (/^https?:\/\//i.test(nameOrUrl)) return nameOrUrl;
    if (!DE_ASSET_BASE) return nameOrUrl;
    return (
        DE_ASSET_BASE.replace(/\/+$/, "") +
        "/" +
        String(nameOrUrl).replace(/^\/+/, "")
    );
}

/* ========= Drive / OneDrive helpers (compat) ========= */

var DRIVE_COMMON_PARAMS = [
    "supportsAllDrives=true",
    "includeItemsFromAllDrives=true",
    "fields=files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,shortcutDetails),nextPageToken",
    "pageSize=1000",
].join("&");
function buildDriveGetUrl(fileId, fields) {
    var f = fields || "id,name,mimeType,shortcutDetails,driveId";
    return (
        "https://www.googleapis.com/drive/v3/files/" +
        fileId +
        "?supportsAllDrives=true&fields=" +
        encodeURIComponent(f) +
        "&key=" +
        Gkey
    );
}
function buildDriveListUrlForUserDrive(folderId) {
    var q = encodeURIComponent(
        "'" + folderId + "' in parents and trashed=false"
    );
    return (
        "https://www.googleapis.com/drive/v3/files?q=" +
        q +
        "&" +
        DRIVE_COMMON_PARAMS +
        "&key=" +
        Gkey
    );
}
function buildDriveListUrlForSharedDrive(folderId, driveId) {
    var q = encodeURIComponent(
        "'" + folderId + "' in parents and trashed=false"
    );
    return (
        "https://www.googleapis.com/drive/v3/files?corpora=drive&driveId=" +
        driveId +
        "&q=" +
        q +
        "&" +
        DRIVE_COMMON_PARAMS +
        "&key=" +
        Gkey
    );
}
function ensureParam(url, name, value) {
    if (url.indexOf(name + "=") === -1) {
        url += (url.indexOf("?") === -1 ? "?" : "&") + name + "=" + value;
    }
    return url;
}

/* ========= CORE: folder prepare (Drive/OneDrive) ========= */

function prepareGFolder(folderLink) {
    var googleReturnObj = {
        csvFiles: {},
        imgFiles: {},
        jsonFiles: {},
        settingFiles: {},
    };
    var folder = folderLink;

    if (folder.type === "GoogleDrive") {
        folder.url = ensureParam(folder.url, "supportsAllDrives", "true");
        folder.url = ensureParam(
            folder.url,
            "includeItemsFromAllDrives",
            "true"
        );
        if (folder.url.indexOf("fields=") === -1) {
            var fields = encodeURIComponent(
                "files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,shortcutDetails),nextPageToken"
            );
            folder.url +=
                (folder.url.indexOf("?") === -1 ? "?" : "&") +
                "fields=" +
                fields;
        }
        folder.url = ensureParam(folder.url, "pageSize", "1000");
        folder.url = ensureParam(folder.url, "key", Gkey);
    }

    d3.json(folder.url, function (error, data) {
        if (error) {
            try {
                var errJson =
                    error && error.response ? JSON.parse(error.response) : null;
                console.error("Drive/OneDrive error:", errJson || error);
                alert(
                    "Errore sorgente dati: " +
                        (errJson?.error?.message ||
                            error.status ||
                            "Bad Request")
                );
            } catch (e) {
                console.error("HTTP error:", error);
                alert(
                    "HTTP error: " +
                        (error && error.status
                            ? error.status
                            : "request failed")
                );
            }
            return;
        }

        if (folder.type === "GoogleDrive") {
            if (!data || !Array.isArray(data.files)) {
                console.error("Drive API: risposta inattesa", data);
                alert("Risposta inattesa da Google Drive.");
                return;
            }
        }

        var csvFiles = {},
            imgFiles = {},
            jsonFiles = {},
            settingFiles = {};

        if (folder.type === "GoogleDrive") {
            data.files.forEach(function (item) {
                var id = item.id,
                    GLink = "";
                if (
                    item.mimeType === "application/vnd.google-apps.shortcut" &&
                    item.shortcutDetails &&
                    item.shortcutDetails.targetId
                ) {
                    id = item.shortcutDetails.targetId;
                }
                if (
                    item.mimeType === "text/csv" ||
                    (item.name && item.name.toLowerCase().endsWith(".csv"))
                ) {
                    GLink =
                        "https://www.googleapis.com/drive/v3/files/" +
                        id +
                        "?alt=media&key=" +
                        Gkey;
                    csvFiles[item.name] = GLink;
                    return;
                }
                if (
                    item.mimeType === "application/vnd.google-apps.spreadsheet"
                ) {
                    GLink =
                        "https://www.googleapis.com/drive/v3/files/" +
                        id +
                        "/export?mimeType=text/csv&key=" +
                        Gkey;
                    csvFiles[(item.name || "sheet_" + id) + ".csv"] = GLink;
                    return;
                }
                if (item.mimeType && item.mimeType.indexOf("image") === 0) {
                    GLink =
                        "https://drive.google.com/thumbnail?id=" +
                        id +
                        "&sz=w1000";
                    imgFiles[item.name] = GLink;
                    return;
                }
                if (
                    item.mimeType === "application/json" ||
                    (item.name && item.name.toLowerCase().endsWith(".json"))
                ) {
                    GLink =
                        "https://www.googleapis.com/drive/v3/files/" +
                        id +
                        "?alt=media&key=" +
                        Gkey;
                    if (item.name && item.name.indexOf("setting") === 0)
                        settingFiles[item.name] = GLink;
                    else jsonFiles[item.name] = GLink;
                    return;
                }
            });
        } else if (folder.type === "OneDrive") {
            var files = [];
            if (data && data.children !== undefined) files = data.children;
            else if (data && data.value !== undefined) files = data.value;
            else console.error("OneDrive: risposta inattesa", data);

            files.forEach(function (item) {
                var fileName = item.name;
                var fileType =
                    item.file && item.file.mimeType ? item.file.mimeType : "";
                var fileLink = item["@content.downloadUrl"];

                if (fileName && fileName.toLowerCase().endsWith(".csv")) {
                    csvFiles[fileName] = fileLink;
                } else if (fileType && fileType.indexOf("image") === 0) {
                    imgFiles[fileName] = fileLink;
                } else if (
                    fileType === "application/json" ||
                    (fileName && fileName.toLowerCase().endsWith(".json"))
                ) {
                    if (fileName && fileName.indexOf("setting") === 0)
                        settingFiles[fileName] = fileLink;
                    else jsonFiles[fileName] = fileLink;
                }
            });
        }

        $.extend(_googleReturnObj.csvFiles, csvFiles);
        $.extend(_googleReturnObj.imgFiles, imgFiles);
        $.extend(_googleReturnObj.jsonFiles, jsonFiles);
        $.extend(_googleReturnObj.settingFiles, settingFiles);

        if (data && data.nextPageToken !== undefined) {
            if (folder.url.indexOf("&pageToken=") > 0)
                folder.url = folder.url.split("&pageToken=", 1)[0];
            folder.url += "&pageToken=" + data.nextPageToken;
            prepareGFolder(folder);
            return;
        } else if (data && data["children@odata.nextLink"] !== undefined) {
            folder.url = data["children@odata.nextLink"];
            prepareGFolder(folder);
            return;
        } else if (data && data["@odata.nextLink"] !== undefined) {
            folder.url = data["@odata.nextLink"];
            prepareGFolder(folder);
            return;
        }

        var csvFile = _googleReturnObj.csvFiles["data.csv"];
        if (csvFile === undefined) {
            var keys = Object.keys(_googleReturnObj.csvFiles || {});
            var alt = keys.find(function (k) {
                return k && k.toLowerCase() === "data.csv";
            });
            if (alt) csvFile = _googleReturnObj.csvFiles[alt];
        }

        if (csvFile === undefined) {
            alert("Non trovo il file data.csv nella cartella sorgente.");
        } else {
            readyToLoad(csvFile);
        }
    });
}

/* ========= Load flow ========= */

function MP_getGoogleIDandLoad(dataMethod) {
    var serverFolderLink;

    document.getElementById("csv-file").value = "";

    // NEW: se è presente ?PROJECT=, non chiedo nulla e carico direttamente /data/<PROJECT>/
    var project = getQueryParam("PROJECT");
    if (project) {
        var folder = buildProjectFolderUrl(project);
        loadFromUrl(folder);
        return;
    }

    if (dataMethod === "URL") {
        document.getElementById("folderLink").value = "";
        var inUrl = window.location.href;
        decodeUrlID(inUrl, function (d) {
            loadFromUrl(d);
        });
    } else {
        serverFolderLink = document.getElementById("folderLink").value;
        loadFromUrl(serverFolderLink);
    }
}

function loadFromUrl(rawUrl) {
    checkInputLink(rawUrl, function (d) {
        _folderInfo = d;

        if (d.type === "userServerLink") {
            var base = d.url;
            if (base.slice(-1) !== "/") base += "/";
            DE_ASSET_BASE = base; // es: .../data/MOX/
            var csvUrl = base + "data.csv";
            readyToLoad(csvUrl + "?v=" + Date.now());
        } else {
            prepareGFolder(d);
        }
    });
}

/* ========= UI small helper ========= */

function changeLabelSize(size) {
    if (size == "largeLabel") d3.selectAll(".label").style("font-size", "95%");
    else if (size == "mediumLabel")
        d3.selectAll(".label").style("font-size", "85%");
    else if (size == "smallLabel")
        d3.selectAll(".label").style("font-size", "75%");
}

/* ========= Link parsing / detection ========= */

function checkInputLink(link, callback) {
    var folderLinkObj = { DE_PW: "", inLink: "", url: "", type: "" };

    if (link.includes("google.com")) {
        var GFolderID = getGFolderID(link);
        var getUrl = buildDriveGetUrl(
            GFolderID,
            "id,name,mimeType,shortcutDetails,driveId"
        );
        d3.json(getUrl, function (error, meta) {
            if (error || !meta) {
                try {
                    var ej =
                        error && error.response
                            ? JSON.parse(error.response)
                            : null;
                    alert(
                        "Errore nel leggere la cartella: " +
                            (ej && ej.error && ej.error.message
                                ? ej.error.message
                                : "Bad Request")
                    );
                } catch (e) {
                    alert("Errore HTTP nel leggere la cartella.");
                }
                return;
            }
            function finalizeWith(id, driveId) {
                var listUrl = driveId
                    ? buildDriveListUrlForSharedDrive(id, driveId)
                    : buildDriveListUrlForUserDrive(id);
                folderLinkObj.url = listUrl;
                folderLinkObj.type = "GoogleDrive";
                folderLinkObj.inLink = link;
                callback(folderLinkObj);
            }
            if (
                meta.mimeType === "application/vnd.google-apps.shortcut" &&
                meta.shortcutDetails &&
                meta.shortcutDetails.targetId
            ) {
                var targetUrl = buildDriveGetUrl(
                    meta.shortcutDetails.targetId,
                    "id,name,mimeType,driveId"
                );
                d3.json(targetUrl, function (e2, targetMeta) {
                    if (e2 || !targetMeta) {
                        alert("Impossibile risolvere la scorciatoia.");
                        return;
                    }
                    finalizeWith(targetMeta.id, targetMeta.driveId || null);
                });
            } else {
                finalizeWith(GFolderID, meta.driveId || null);
            }
        });
    } else if (link.includes("1drv.ms")) {
        folderLinkObj.url =
            "https://api.onedrive.com/v1.0/shares/u!" +
            encodeUrl(link) +
            "/root?expand=children";
        folderLinkObj.type = "OneDrive";
        folderLinkObj.inLink = link;
        callback(folderLinkObj);
    } else {
        // Qualsiasi URL http(s) di CARTELLA progetto (es: .../data/MOX/)
        folderLinkObj.url = link;
        folderLinkObj.type = "userServerLink";
        folderLinkObj.inLink = link;
        callback(folderLinkObj);
    }
}

function getGFolderID(link) {
    var linkID;
    if (link.includes("google.com")) {
        if (link.includes("?usp=sharing"))
            linkID = link.replace("?usp=sharing", "");
        else if (link.includes("open?id="))
            linkID = link.replace("open?id=", "");
        else linkID = link;
        linkID = linkID.split("/");
        linkID = linkID[linkID.length - 1];
    } else linkID = link;
    return linkID;
}

/* ========= Clipboard & shorteners (legacy) ========= */

var BitlyKey = "52e99e2d788d32ae8ea99007d96917ac4ba50a5a";

function CopyToClipboard(element) {
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val($(element).text()).select();
    document.execCommand("copy");
    $temp.remove();
}

function makeUrlId(rawUrl, callback) {
    $.ajax({
        type: "POST",
        contentType: "application/json",
        url: "https://api-ssl.bitly.com/v4/shorten",
        data: JSON.stringify({ long_url: rawUrl }),
        headers: {
            Authorization: BitlyKey,
            "Content-Type": "application/json",
        },
        error: function () {
            callback(encodeUrl(rawUrl));
        },
        dataType: "json",
        success: function (response) {
            var UrlID = "";
            if (response.id != null) {
                UrlID = response.id.split("/");
                UrlID = UrlID[UrlID.length - 1];
            }
            callback("BL_" + UrlID);
        },
    });
}

function getUrlID(urlID, callback) {
    $.ajax({
        url: "https://api-ssl.bitly.com/v4/expand",
        type: "POST",
        dataType: "json",
        data: JSON.stringify({ bitlink_id: "bit.ly/" + urlID }),
        headers: { Authorization: BitlyKey },
        contentType: "application/json",
        success: function (result) {
            callback(result.long_url);
        },
        error: function () {},
    });
}

function decodeUrlID(rawUrl, callback) {
    var serverFolderLink = "";
    var urlVars = getUrlVars(rawUrl);
    var GfolderORUrl = urlVars.GFOLDER;
    var DEID = urlVars.ID;

    if (GfolderORUrl !== undefined) {
        if (GfolderORUrl.search("/") == -1) {
            serverFolderLink =
                "https://drive.google.com/drive/folders/" + GfolderORUrl;
        } else {
            serverFolderLink = GfolderORUrl;
        }
        callback(serverFolderLink);
    } else if (DEID !== undefined) {
        var linkID = DEID;
        if (linkID.length === 6) {
            d3.json(
                "https://www.googleapis.com/urlshortener/v1/url?key=" +
                    Gkey +
                    "&shortUrl=http://goo.gl/" +
                    linkID,
                function (d) {
                    var GID = getUrlVars(d.longUrl).ID;
                    serverFolderLink = decodeUrl(GID);
                    callback(serverFolderLink);
                }
            );
        } else if (linkID.startsWith("BL_")) {
            getUrlID(linkID.replace("BL_", ""), function (d) {
                var GID = getUrlVars(d).ID;
                serverFolderLink = decodeUrl(GID);
                callback(serverFolderLink);
            });
        } else {
            serverFolderLink = decodeUrl(linkID);
            callback(serverFolderLink);
        }
    } else {
        // no ID: niente
    }
}
