/* ===========================
   designExplorer.js (full)
   =========================== */

function unloadPageContent() {
    /*
     // This function removes current contents from the page
     // Only base HTML objects will remain in the page afterwards
     // Use this in case you want to load new data to the page
    */
    overwriteInitialGlobalValues();

    d3.select("div.legend").selectAll("*").remove(); // remove legend

    d3.select("#inputSliders").selectAll("*").remove(); //remove sliders
    d3.select("#inputSliders").append("form").attr("class", "sliders"); // append a form

    d3.select("div#graph").selectAll("*").remove(); //remove left side parallel coord graph
    d3.select("div#radarChart").selectAll("*").remove(); //remove right side graph

    d3.select("div#thumbnails-btm_container")
        .select("div#sorting")
        .selectAll("*")
        .remove(); // remove sorting drop-down
    d3.select("div#thumbnails-btm_container").select("div#sorting").text("");
    d3.select("div#thumbnails-btm_container")
        .select("div#thumbnails-btm")
        .selectAll("*")
        .remove(); // remove thumbnail images

    d3.select("div#thumbnails-side_container")
        .select("div#sorting")
        .selectAll("*")
        .remove(); // remove thumbnail images
    d3.select("div#thumbnails-side_container").select("div#sorting").text("");
    d3.select("div#thumbnails-side_container")
        .select("div#thumbnails-side")
        .selectAll("*")
        .remove(); // remove thumbnail images

    d3.select("div#zoomed").selectAll("*").remove(); //remove zoomed image if any
    d3.select("div#viewer3d").selectAll("*").remove(); //remove any object inside 3D viewer
}

function calWidthAndHeight() {
    (windowWidth = window.innerWidth),
        (windowHeight = window.innerHeight),
        (cleanHeight = windowHeight - 115), // 2
        (cleanWidth = windowWidth - 100),
        (graphHeight = cleanHeight / 3 - 24), //remove 22+2 top tool button
        (zoomedHeight = (cleanHeight * 2) / 3); //remove 22+2 top tool button
}

function overwriteInitialGlobalValues() {
    /*
     // This function initiates all the global values for the page
     // I'm not sure if this is the best practice in javascript (probably it's not)
     // Let me (github.com/mostaphaRoudsari) know if you know a better solution
    */

    originalData = ""; //csv as it is imported
    cleanedData = []; //all the columns to be used for parallel coordinates
    (numericalData = []), (inputData = []); // columns with input values - to be used for sliders
    outputData = []; // columns with output values - to be used for radar graph
    slidersInfo = []; // {name:'inputName', tickValues : [sorted set of values]},
    currentSliderValues = {}; // collector for values
    allDataCollector = {};
    slidersMapping = {}; // I collect the data for all the input sliders here so I can use it to remap the sliders later
    ids = []; // Here I collect all data based on a unique ID from inputs
    cleanedKeys4pc = {};
    googleFolderLink = "";

    inputDataKeys = [];
    outputDataKeys = [];
    imageLinkKeys = [];

    _userSetting = {
        studyInfo: {
            name: "",
            date: "",
        },
        dimScales: {},
        dimTicks: {},
        dimMark: {},
    };

    rcheight = height = d3.select("#graph").style("height").replace("px", "");

    selectedDataFormatted = [];

    firstRating = true; // variable for star rating

    //set up heights of divs ro default
    calWidthAndHeight();

    pcHeight = d3.select("#graph").style("height").replace("px", "");
    // hide zoomed area
    d3.selectAll(".zoomed").style("height", "0px");
    // show btm thumbnail
    d3.select("#thumbnails-btm_container").style("height", zoomedHeight + "px");

    // re-set the viewer to 2D
    currentView = "2D";
    // set view toggle to 2D
    d3.select("input#toggleView").property("checked", "true");

    initit3DViewer = true;
    d3.select("#zoomed").classed("hidden", false);
    d3.select("#viewer3d").classed("hidden", true);
}

function getUrlVars(rawUrl) {
    var vars = {};
    var parts = rawUrl.replace(
        /[?&]+([^=&]+)=([^&]*)/gi,
        function (m, key, value) {
            vars[key] = value;
        }
    );
    return vars;
}

/* ===========================
   Config & Globals
   =========================== */

var Gkey =
    "657923880311-6k06i9vqt6c0nl0k9dsvlqu08qdodlit.apps.googleusercontent.com";
var BitlyKey = "52e99e2d788d32ae8ea99007d96917ac4ba50a5a";

// global collector used across paginated calls
var _googleReturnObj = {
    csvFiles: {},
    imgFiles: {},
    jsonFiles: {},
    settingFiles: {},
};

// Drive helpers / defaults
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

// small util
function ensureParam(url, name, value) {
    if (url.indexOf(name + "=") === -1) {
        url += (url.indexOf("?") === -1 ? "?" : "&") + name + "=" + value;
    }
    return url;
}

/* ===========================
   Core: listing folders
   =========================== */

function prepareGFolder(folderLink) {
    // local collector for this page of results
    var googleReturnObj = {
        csvFiles: {},
        imgFiles: {},
        jsonFiles: {},
        settingFiles: {},
    };

    var folder = folderLink;

    // for Google Drive, ensure robust flags (in case URL was hand-built)
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
        // --- error handling ---
        if (error) {
            try {
                var errJson =
                    error && error.response ? JSON.parse(error.response) : null;
                console.error("Drive API error:", errJson || error);
                alert(
                    "Drive API error: " +
                        (errJson && errJson.error && errJson.error.message
                            ? errJson.error.message
                            : error.status || "Bad Request")
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

        // --- data guard ---
        if (folder.type === "GoogleDrive") {
            if (!data || !Array.isArray(data.files)) {
                console.error("Drive API: risposta inattesa", data);
                alert(
                    "Non riesco a leggere il contenuto della cartella (risposta inattesa da Drive)."
                );
                return;
            }
        }

        var csvFiles = {};
        var imgFiles = {};
        var jsonFiles = {};
        var settingFiles = {};

        if (folder.type === "GoogleDrive") {
            data.files.forEach(function (item) {
                var id = item.id;
                var GLink = "";

                // resolve shortcut to target id (basic)
                if (
                    item.mimeType === "application/vnd.google-apps.shortcut" &&
                    item.shortcutDetails &&
                    item.shortcutDetails.targetId
                ) {
                    id = item.shortcutDetails.targetId;
                }

                // CSV reali o con estensione .csv
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

                // Google Sheet -> export CSV
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

                // images
                if (item.mimeType && item.mimeType.indexOf("image") === 0) {
                    GLink =
                        "https://drive.google.com/thumbnail?id=" +
                        id +
                        "&sz=w1000";
                    imgFiles[item.name] = GLink;
                    return;
                }

                // JSON file classici
                if (
                    item.mimeType === "application/json" ||
                    (item.name && item.name.toLowerCase().endsWith(".json"))
                ) {
                    GLink =
                        "https://www.googleapis.com/drive/v3/files/" +
                        id +
                        "?alt=media&key=" +
                        Gkey;
                    if (item.name && item.name.indexOf("setting") === 0) {
                        settingFiles[item.name] = GLink;
                    } else {
                        jsonFiles[item.name] = GLink;
                    }
                    return;
                }
            });
        } else if (folder.type === "OneDrive") {
            var files = [];
            if (data && data.children !== undefined) {
                files = data.children;
            } else if (data && data.value !== undefined) {
                files = data.value;
            } else {
                console.error("OneDrive: risposta inattesa", data);
            }

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
                    if (fileName && fileName.indexOf("setting") === 0) {
                        settingFiles[fileName] = fileLink;
                    } else {
                        jsonFiles[fileName] = fileLink;
                    }
                }
            });
        }

        // merge into global collector
        $.extend(_googleReturnObj.csvFiles, csvFiles);
        $.extend(_googleReturnObj.imgFiles, imgFiles);
        $.extend(_googleReturnObj.jsonFiles, jsonFiles);
        $.extend(_googleReturnObj.settingFiles, settingFiles);

        // pagination handling
        if (data && data.nextPageToken !== undefined) {
            if (folder.url.indexOf("&pageToken=") > 0) {
                folder.url = folder.url.split("&pageToken=", 1)[0];
            }
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

        // final: look for data.csv
        var csvFile = _googleReturnObj.csvFiles["data.csv"];
        if (csvFile === undefined) {
            var keys = Object.keys(_googleReturnObj.csvFiles || {});
            var alt = keys.find(function (k) {
                return k && k.toLowerCase() === "data.csv";
            });
            if (alt) csvFile = _googleReturnObj.csvFiles[alt];
        }

        if (csvFile === undefined) {
            alert(
                "Non trovo il file data.csv nella cartella.\nControlla nome/visibilità.\n(Se usi Google Sheet, l’export CSV è gestito.)"
            );
        } else {
            readyToLoad(csvFile);
        }
    });
}

/* ===========================
   Load flow
   =========================== */

function MP_getGoogleIDandLoad(dataMethod) {
    var serverFolderLink;

    document.getElementById("csv-file").value = "";

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
        _folderInfo = d; //set global foler obj

        if (d.type === "userServerLink") {
            // user’s direct server link; load csv directly
            if (d.url.slice(-1) !== "/") d.url += "/";
            readyToLoad(d.url + "data.csv");
        } else {
            // Google / OneDrive
            prepareGFolder(d);
        }
    });
}

function changeLabelSize(size) {
    if (size == "largeLabel") {
        d3.selectAll(".label").style("font-size", "95%");
    } else if (size == "mediumLabel") {
        d3.selectAll(".label").style("font-size", "85%");
    } else if (size == "smallLabel") {
        d3.selectAll(".label").style("font-size", "75%");
    }
}

/* ===========================
   Link parsing / detection
   =========================== */

function checkInputLink(link, callback) {
    var folderLinkObj = {
        DE_PW: "",
        inLink: "",
        url: "",
        type: "",
    };

    if (link.includes("google.com")) {
        // Google Drive
        var GFolderID = getGFolderID(link);

        // Prima interrogo meta per capire se è shortcut e se è su Shared Drive
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
                // resolve target
                var targetUrl = buildDriveGetUrl(
                    meta.shortcutDetails.targetId,
                    "id,name,mimeType,driveId"
                );
                d3.json(targetUrl, function (e2, targetMeta) {
                    if (e2 || !targetMeta) {
                        alert(
                            "Impossibile risolvere la scorciatoia della cartella."
                        );
                        return;
                    }
                    finalizeWith(targetMeta.id, targetMeta.driveId || null);
                });
            } else {
                finalizeWith(GFolderID, meta.driveId || null);
            }
        });
    } else if (link.includes("1drv.ms")) {
        // OneDrive
        folderLinkObj.url =
            "https://api.onedrive.com/v1.0/shares/u!" +
            encodeUrl(link) +
            "/root?expand=children";
        folderLinkObj.type = "OneDrive";
        folderLinkObj.inLink = link;
        callback(folderLinkObj);
    } else {
        // user server link
        if (link.slice(-1) !== "/") {
            link += "/";
        }
        folderLinkObj.url = link;
        folderLinkObj.type = "userServerLink";
        folderLinkObj.inLink = link;
        callback(folderLinkObj);
    }
}

function encodeUrl(url) {
    var link = btoa(url);
    return link;
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

function getGFolderID(link) {
    var linkID;

    if (link.includes("google.com")) {
        if (link.includes("?usp=sharing")) {
            linkID = link.replace("?usp=sharing", "");
        } else if (link.includes("open?id=")) {
            linkID = link.replace("open?id=", "");
        } else {
            linkID = link;
        }
        linkID = linkID.split("/");
        linkID = linkID[linkID.length - 1];
    } else {
        //server link or ms
        linkID = link;
    }

    return linkID;
}

/* ===========================
   Misc utils
   =========================== */

function CopyToClipboard(element) {
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val($(element).text()).select();
    document.execCommand("copy");
    $temp.remove();
}

function makeUrlId(rawUrl, callback) {
    var longUrl = rawUrl;

    $.ajax({
        type: "POST",
        contentType: "application/json",
        url: "https://api-ssl.bitly.com/v4/shorten",
        data: JSON.stringify({
            long_url: longUrl,
        }),
        headers: {
            Authorization: BitlyKey,
            "Content-Type": "application/json",
        },
        error: function (e) {
            callback(encodeUrl(longUrl));
        },
        dataType: "json",
        success: function (response) {
            var UrlID = "";
            if (response.id != null) {
                // response.id es: https://bit.ly/xyz
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
        data: JSON.stringify({
            bitlink_id: "bit.ly/" + urlID,
        }),
        headers: {
            Authorization: BitlyKey,
        },
        contentType: "application/json",
        success: function (result) {
            callback(result.long_url);
        },
        error: function (error) {},
    });
}

function decodeUrlID(rawUrl, callback) {
    var serverFolderLink = "";
    var urlVars = getUrlVars(rawUrl);
    var GfolderORUrl = urlVars.GFOLDER;
    var DEID = urlVars.ID;

    // old GFOLDER
    if (GfolderORUrl !== undefined) {
        if (GfolderORUrl.search("/") == -1) {
            // GfolderORUrl is google folder ID
            serverFolderLink =
                "https://drive.google.com/drive/folders/" + GfolderORUrl;
        } else {
            serverFolderLink = GfolderORUrl;
        }
        callback(serverFolderLink);
    } else if (DEID !== undefined) {
        // NOTE: la parte con google url shortener è legacy; se non necessario puoi rimuoverla.
        linkID = DEID;

        if (linkID.length === 6) {
            // Legacy goo.gl (deprecato) – mantenuto per retro-compatibilità
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
        // nothing to decode
    }
}
