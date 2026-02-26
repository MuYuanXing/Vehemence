(function () {
    "use strict";

    var MODULE_ID = "Vehemence";
    var MODULE_VERSION = "V1.2";
    var MODDIR = "/data/adb/modules/" + MODULE_ID;
    var callbackSeq = 0;
    var currentPage = "thermal";
    var selectedApps = {};
    var allApps = [];
    var appFilter = "user";

    var _appListSaveTimer = null;

    var configValues = {
        batt_temp_mc: 34000,
        cpu_temp_mc: 40000,
        gpu_temp_mc: 40000,
        ddr_temp_mc: 40000,
        horae_stop: 1,
        app_trigger: 0,
        charge_trigger: 0,
        charge_batt_temp_mc: 30000,
        charge_cpu_temp_mc: 35000,
        charge_gpu_temp_mc: 35000,
        charge_ddr_temp_mc: 35000,
        app_batt_temp_mc: 30000,
        app_cpu_temp_mc: 35000,
        app_gpu_temp_mc: 35000,
        app_ddr_temp_mc: 35000
    };

    function ksuExec(cmd, timeout) {
        if (typeof ksu === "undefined" || !ksu.exec) {
            return Promise.resolve({ errno: -1, stdout: "", stderr: "ksu not available" });
        }
        var ms = timeout || 10000;
        return new Promise(function (resolve) {
            var cbName = "cb_" + Date.now() + "_" + (++callbackSeq);
            var timer = setTimeout(function () {
                delete window[cbName];
                resolve({ errno: -1, stdout: "", stderr: "timeout" });
            }, ms);
            window[cbName] = function (errno, stdout, stderr) {
                clearTimeout(timer);
                delete window[cbName];
                resolve({ errno: Number(errno), stdout: stdout || "", stderr: stderr || "" });
            };
            try {
                ksu.exec(cmd, "{}", cbName);
            } catch (e) {
                clearTimeout(timer);
                delete window[cbName];
                resolve({ errno: -1, stdout: "", stderr: String(e) });
            }
        });
    }

    function ksuSpawn(cmd, timeout) {
        if (typeof ksu === "undefined" || !ksu.spawn) {
            return ksuExec(cmd, timeout);
        }
        var ms = timeout || 30000;
        return new Promise(function (resolve) {
            var cbName = "sp_" + Date.now() + "_" + (++callbackSeq);
            var buf = [];
            var done = false;
            var timer = setTimeout(function () {
                if (!done) {
                    done = true;
                    delete window[cbName];
                    resolve({ errno: -1, stdout: buf.join("\n"), stderr: "timeout" });
                }
            }, ms);
            window[cbName] = {
                stdout: { emit: function (ev, d) { if (ev === "data") buf.push(d); } },
                stderr: { emit: function () {} },
                emit: function (ev, d) {
                    if (done) return;
                    if (ev === "exit" || ev === "error") {
                        done = true;
                        clearTimeout(timer);
                        delete window[cbName];
                        resolve({
                            errno: ev === "exit" ? Number(d) : -1,
                            stdout: buf.join("\n"),
                            stderr: ev === "error" ? String(d) : ""
                        });
                    }
                }
            };
            try {
                ksu.spawn(cmd, "[]", "{}", cbName);
            } catch (e) {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    delete window[cbName];
                    resolve({ errno: -1, stdout: "", stderr: String(e) });
                }
            }
        });
    }

    function showToast(msg, type) {
        var c = document.getElementById("toast-container");
        var t = document.createElement("div");
        t.className = "toast " + (type || "");
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
        }, 2500);
    }

    function escHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function isValidPid(s) {
        return /^\d+$/.test(s);
    }

    function writeConfigFile() {
        var path = MODDIR + "/state/config.prop";
        var lines = [];
        var keys = [
            "batt_temp_mc", "cpu_temp_mc", "gpu_temp_mc", "ddr_temp_mc",
            "horae_stop", "app_trigger", "charge_trigger",
            "charge_batt_temp_mc", "charge_cpu_temp_mc",
            "charge_gpu_temp_mc", "charge_ddr_temp_mc",
            "app_batt_temp_mc", "app_cpu_temp_mc",
            "app_gpu_temp_mc", "app_ddr_temp_mc"
        ];
        for (var i = 0; i < keys.length; i++) {
            lines.push("'" + keys[i] + "=" + String(Math.floor(configValues[keys[i]])) + "'");
        }
        var cmd = "printf '%s\\n' " + lines.join(" ") + " > " + path;
        return ksuExec(cmd);
    }

    function ksudSet(key, value) {
        return ksuExec("KSU_MODULE=" + MODULE_ID + " ksud module config set '" + key + "' '" + value + "' 2>/dev/null");
    }

    function signalDaemon() {
        return ksuExec("/system/bin/cat " + MODDIR + "/state/Vehemence.pid 2>/dev/null").then(function (r) {
            var pid = r.stdout.trim();
            if (isValidPid(pid)) {
                return ksuExec("kill -USR1 " + pid + " 2>/dev/null");
            }
            return Promise.resolve({ errno: -1 });
        });
    }

    function applyConfig(text) {
        if (!text) return;
        var lines = text.split("\n");
        lines.forEach(function (line) {
            var eq = line.indexOf("=");
            if (eq < 0) return;
            var key = line.substring(0, eq);
            var val = parseInt(line.substring(eq + 1), 10);
            if (isNaN(val)) return;
            if (configValues.hasOwnProperty(key)) {
                configValues[key] = val;
            }
        });

        var normalMap = [
            { key: "batt_temp_mc", slider: "batt-slider", display: "batt-value" },
            { key: "cpu_temp_mc", slider: "cpu-slider", display: "cpu-value" },
            { key: "gpu_temp_mc", slider: "gpu-slider", display: "gpu-value" },
            { key: "ddr_temp_mc", slider: "ddr-slider", display: "ddr-value" }
        ];
        normalMap.forEach(function (m) {
            var slider = document.getElementById(m.slider);
            var display = document.getElementById(m.display);
            if (!slider) return;
            var min = parseInt(slider.min, 10);
            var max = parseInt(slider.max, 10);
            var deg = Math.max(min, Math.min(max, Math.round(configValues[m.key] / 1000)));
            slider.value = deg;
            if (display) display.textContent = deg;
        });

        var chargeMap = [
            { key: "charge_batt_temp_mc", slider: "charge-batt-slider", display: "charge-batt-value" },
            { key: "charge_cpu_temp_mc", slider: "charge-cpu-slider", display: "charge-cpu-value" },
            { key: "charge_gpu_temp_mc", slider: "charge-gpu-slider", display: "charge-gpu-value" },
            { key: "charge_ddr_temp_mc", slider: "charge-ddr-slider", display: "charge-ddr-value" }
        ];
        chargeMap.forEach(function (m) {
            var slider = document.getElementById(m.slider);
            var display = document.getElementById(m.display);
            if (!slider) return;
            var min = parseInt(slider.min, 10);
            var max = parseInt(slider.max, 10);
            var deg = Math.max(min, Math.min(max, Math.round(configValues[m.key] / 1000)));
            slider.value = deg;
            if (display) display.textContent = deg;
        });

        var appMap = [
            { key: "app_batt_temp_mc", slider: "app-batt-slider", display: "app-batt-value" },
            { key: "app_cpu_temp_mc", slider: "app-cpu-slider", display: "app-cpu-value" },
            { key: "app_gpu_temp_mc", slider: "app-gpu-slider", display: "app-gpu-value" },
            { key: "app_ddr_temp_mc", slider: "app-ddr-slider", display: "app-ddr-value" }
        ];
        appMap.forEach(function (m) {
            var slider = document.getElementById(m.slider);
            var display = document.getElementById(m.display);
            if (!slider) return;
            var min = parseInt(slider.min, 10);
            var max = parseInt(slider.max, 10);
            var deg = Math.max(min, Math.min(max, Math.round(configValues[m.key] / 1000)));
            slider.value = deg;
            if (display) display.textContent = deg;
        });

        var horaeToggle = document.getElementById("horae-toggle");
        if (horaeToggle) {
            horaeToggle.checked = (configValues.horae_stop !== 0);
            updateHoraeDesc(horaeToggle.checked);
        }

        var appTriggerToggle = document.getElementById("app-trigger-toggle");
        if (appTriggerToggle) {
            appTriggerToggle.checked = (configValues.app_trigger !== 0);
            updateAppTriggerDesc(appTriggerToggle.checked);
        }

        var chargeTriggerToggle = document.getElementById("charge-trigger-toggle");
        if (chargeTriggerToggle) {
            chargeTriggerToggle.checked = (configValues.charge_trigger !== 0);
        }
    }

    function loadConfig() {
        ksuExec("/system/bin/cat " + MODDIR + "/state/config.prop 2>/dev/null").then(function (r) {
            applyConfig(r.stdout.trim());
        });
    }

    function updateHoraeDesc(enabled) {
        var desc = document.getElementById("horae-desc");
        if (!desc) return;
        if (enabled) {
            desc.textContent = "Horae 温控服务已停止，不会干扰温度伪装效果";
            desc.className = "horae-desc";
        } else {
            desc.textContent = "Horae 温控服务运行中，可能干扰温度伪装效果";
            desc.className = "horae-desc warn";
        }
    }

    function updateAppTriggerDesc(enabled) {
        var desc = document.getElementById("app-trigger-desc");
        if (!desc) return;
        if (enabled) {
            desc.textContent = "已开启，选中的应用在前台时使用下方温度值，其他时候使用温控页全局温度";
        } else {
            desc.textContent = "已关闭，始终使用温控页全局温度";
        }
    }

    function formatLogLine(raw) {
        var kv = {};
        raw.replace(/(\w+)=(\d+)/g, function (_, k, v) {
            kv[k] = v;
        });
        if (!kv.round) return null;
        return {
            round: kv.round,
            nodes: kv.nodes || "0",
            batt: kv.batt || "0",
            cpu: kv.cpu || "0",
            gpu: kv.gpu || "0",
            ddr: kv.ddr || "0",
            mounts: kv.mounts || "0",
            mounted_total: kv.mounted_total || "0",
            flaps: kv.flaps || "0",
            sleep: kv.sleep || "0"
        };
    }

    function renderLogHtml(text) {
        if (!text) return '<div class="log-empty">暂无日志</div>';
        var lines = text.trim().split("\n");
        var html = [];
        for (var i = 0; i < lines.length; i++) {
            var parsed = formatLogLine(lines[i]);
            if (!parsed) continue;
            html.push(
                '<div class="log-line">' +
                    '<div class="log-round">轮次 #' + escHtml(parsed.round) + '</div>' +
                    '<div class="log-detail">' +
                        '<span>节点 ' + escHtml(parsed.nodes) + '</span>' +
                        '<span class="log-stat-batt">电池 ' + escHtml(parsed.batt) + '</span>' +
                        '<span class="log-stat-cpu">处理器 ' + escHtml(parsed.cpu) + '</span>' +
                        '<span class="log-stat-gpu">图形 ' + escHtml(parsed.gpu) + '</span>' +
                        '<span class="log-stat-ddr">内存 ' + escHtml(parsed.ddr) + '</span>' +
                    '</div>' +
                    '<div class="log-detail">' +
                        '<span>本轮挂载 ' + escHtml(parsed.mounts) + '</span>' +
                        '<span>总挂载 ' + escHtml(parsed.mounted_total) + '</span>' +
                        '<span>修正 ' + escHtml(parsed.flaps) + '</span>' +
                        '<span>休眠 ' + escHtml(parsed.sleep) + 's</span>' +
                    '</div>' +
                '</div>'
            );
        }
        return html.length ? html.join("") : '<div class="log-empty">暂无日志</div>';
    }

    var DELIM = "===V===";

    function applyDaemonStatus(text) {
        var lines = text.split("\n");
        var pid = "", alive = false;
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim();
            if (!l) continue;
            if (!pid && isValidPid(l)) { pid = l; continue; }
            if (l === "alive" || l === "dead") { alive = (l === "alive"); break; }
        }
        var dot = document.getElementById("status-dot");
        var statusEl = document.getElementById("daemon-status");
        if (!dot || !statusEl) return;
        if (!pid) {
            dot.className = "status-dot error";
            statusEl.textContent = "未运行";
            return;
        }
        dot.className = alive ? "status-dot active" : "status-dot error";
        statusEl.textContent = alive ? "运行中 (PID " + pid + ")" : "已停止";
    }

    function applyLogLine(text) {
        var line = text.trim();
        if (!line) return;
        var m, el;
        m = line.match(/round=(\d+)/);
        if (m) { el = document.getElementById("daemon-round"); if (el) el.textContent = m[1]; }
        m = line.match(/nodes=(\d+)/);
        if (m) { el = document.getElementById("daemon-nodes"); if (el) el.textContent = m[1]; }
        m = line.match(/mounted_total=(\d+)/);
        if (m) { el = document.getElementById("daemon-mounts"); if (el) el.textContent = m[1]; }
    }

    var _lastNodeListText = null;
    function applyNodeList(text) {
        if (text === _lastNodeListText) return;
        _lastNodeListText = text;
        var counts = { batt: 0, cpu: 0, gpu: 0, ddr: 0 };
        var nodeList = document.getElementById("node-list");
        if (!text) {
            nodeList.innerHTML = "";
            document.getElementById("n-batt").textContent = 0;
            document.getElementById("n-cpu").textContent = 0;
            document.getElementById("n-gpu").textContent = 0;
            document.getElementById("n-ddr").textContent = 0;
            return;
        }
        var lines = text.split("\n");
        var nodeHtml = [];
        lines.forEach(function (line) {
            var parts = line.split("\t");
            if (parts.length < 2) return;
            var cls = parts[0];
            var path = parts[1];
            if (counts[cls] !== undefined) counts[cls]++;
            nodeHtml.push(
                '<div class="node-item"><span class="node-class c-' + escHtml(cls) + '">' +
                escHtml(cls.toUpperCase()) + '</span><span class="node-path">' + escHtml(path) + '</span></div>'
            );
        });
        document.getElementById("n-batt").textContent = counts.batt;
        document.getElementById("n-cpu").textContent = counts.cpu;
        document.getElementById("n-gpu").textContent = counts.gpu;
        document.getElementById("n-ddr").textContent = counts.ddr;
        nodeList.innerHTML = nodeHtml.join("");
    }

    function applyChargeData(text) {
        var lines = text.split("\n");
        var statusMap = {
            "Charging": "充电中",
            "Discharging": "未充电",
            "Full": "已充满",
            "Not charging": "未充电"
        };
        var statusEl = document.getElementById("charge-status");
        var levelEl = document.getElementById("charge-level");
        var tempEl = document.getElementById("charge-bat-temp");
        var currentEl = document.getElementById("charge-current");
        var rawStatus = (lines[0] || "").trim();
        if (statusEl) statusEl.textContent = statusMap[rawStatus] || rawStatus || "-";
        var rawLevel = (lines[1] || "").trim();
        if (levelEl) levelEl.textContent = rawLevel ? rawLevel + "%" : "-";
        var rawTemp = parseInt((lines[2] || "").trim(), 10);
        if (tempEl) tempEl.textContent = isNaN(rawTemp) ? "-" : (rawTemp / 10).toFixed(1) + "°C";
        var rawCurrent = parseInt((lines[3] || "").trim(), 10);
        if (currentEl) currentEl.textContent = isNaN(rawCurrent) ? "-" : Math.abs(Math.round(rawCurrent / 1000)) + "mA";
    }

    var pageOrder = { apps: 0, thermal: 1, charge: 2 };

    function updateNavIndicator(name) {
        var indicator = document.getElementById("nav-indicator");
        var target = document.getElementById("nav-" + name);
        if (!indicator || !target) return;
        indicator.style.width = target.offsetWidth + "px";
        indicator.style.transform = "translateX(" + target.offsetLeft + "px)";
    }

    function switchPage(name) {
        var oldIndex = pageOrder[currentPage] || 1;
        var newIndex = pageOrder[name] || 1;

        var pages = document.querySelectorAll(".page");
        for (var i = 0; i < pages.length; i++) {
            pages[i].style.display = "none";
            pages[i].style.animation = "";
        }
        var target = document.getElementById("page-" + name);
        if (target) {
            target.style.display = "";
            if (newIndex !== oldIndex) {
                var anim = newIndex > oldIndex ? "page-slide-left" : "page-slide-right";
                target.style.animation = "none";
                void target.offsetHeight;
                target.style.animation = anim + " 0.3s var(--ease-out)";
            }
        }
        var navItems = document.querySelectorAll(".nav-item");
        for (var j = 0; j < navItems.length; j++) {
            navItems[j].classList.remove("active");
        }
        var activeNav = document.getElementById("nav-" + name);
        if (activeNav) activeNav.classList.add("active");

        updateNavIndicator(name);
        currentPage = name;

        if (name === "apps" && !appListLoaded) {
            appListLoaded = true;
            loadAppList();
        }
    }

    function toggleTheme() {
        var root = document.documentElement;
        root.classList.add("theme-transition");

        var btn = document.getElementById("theme-toggle");
        if (btn) {
            btn.style.animation = "none";
            void btn.offsetHeight;
            btn.style.animation = "theme-bounce 0.4s var(--spring)";
        }

        var isDark = root.dataset.theme === "dark";
        if (isDark) {
            root.dataset.theme = "";
            localStorage.setItem("vehemence-theme", "");
        } else {
            root.dataset.theme = "dark";
            localStorage.setItem("vehemence-theme", "dark");
        }
        var meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) {
            meta.content = root.dataset.theme === "dark" ? "dark" : "light dark";
        }

        setTimeout(function () {
            root.classList.remove("theme-transition");
        }, 650);
    }

    function loadTheme() {
        var saved = localStorage.getItem("vehemence-theme");
        if (saved === "dark") {
            document.documentElement.dataset.theme = "dark";
            var meta = document.querySelector('meta[name="color-scheme"]');
            if (meta) meta.content = "dark";
        }
    }

    function loadAppList() {
        var listEl = document.getElementById("app-list");
        if (!listEl) return;

        if (typeof ksu === "undefined" || !ksu.exec) {
            listEl.innerHTML = '<div class="app-loading">请在 KernelSU 管理器中打开</div>';
            return;
        }

        ksuSpawn("/system/bin/cat " + MODDIR + "/state/apps.list 2>/dev/null").then(function (r) {
            selectedApps = {};
            var text = r.stdout.trim();
            if (text) {
                text.split("\n").forEach(function (line) {
                    var pkg = line.trim();
                    if (pkg) selectedApps[pkg] = true;
                });
            }
            var dexPath = MODDIR + "/webroot/tool/appinfo.dex";
            var cmd = "export CLASSPATH=" + dexPath +
                      " && app_process /system/bin --nice-name=appinfo muyuanxing.appinfo.AppInfo -o pn,an,f -a --sort";
            return ksuSpawn(cmd, 30000);
        }).then(function (r) {
            if (!r || !r.stdout.trim()) {
                listEl.innerHTML = '<div class="app-loading">无可用应用</div>';
                return;
            }
            allApps = [];
            r.stdout.trim().split("\n").forEach(function (line) {
                var parts = line.split("\t");
                if (parts.length >= 3 && parts[0]) {
                    allApps.push({
                        packageName: parts[0],
                        appLabel: parts[1] || parts[0],
                        isSystem: parts[2] === "1"
                    });
                }
            });
            updateFilterCounts();
            renderAppList();
        }).catch(function () {
            listEl.innerHTML = '<div class="app-loading">加载应用列表失败，请重试</div>';
        });
    }

    function updateFilterCounts() {
        var userCount = 0, sysCount = 0;
        for (var i = 0; i < allApps.length; i++) {
            if (allApps[i].isSystem) sysCount++;
            else userCount++;
        }
        var el;
        el = document.getElementById("filter-count-user");
        if (el) el.textContent = userCount;
        el = document.getElementById("filter-count-system");
        if (el) el.textContent = sysCount;
        el = document.getElementById("filter-count-all");
        if (el) el.textContent = allApps.length;
    }

    function renderAppList() {
        var listEl = document.getElementById("app-list");
        if (!listEl) return;

        var filtered = [];
        for (var i = 0; i < allApps.length; i++) {
            var app = allApps[i];
            if (appFilter === "user" && app.isSystem) continue;
            if (appFilter === "system" && !app.isSystem) continue;
            filtered.push(app);
        }

        var sorted = filtered.slice().sort(function (a, b) {
            var aSelected = selectedApps[a.packageName] ? 1 : 0;
            var bSelected = selectedApps[b.packageName] ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            return (a.appLabel || "").localeCompare(b.appLabel || "");
        });

        var html = [];
        for (var i = 0; i < sorted.length; i++) {
            var app = sorted[i];
            var sel = selectedApps[app.packageName] ? " selected" : "";
            var delay = i < 10 ? i * 25 : 250;
            html.push(
                '<div class="app-item' + sel + '" style="animation-delay:' + delay + 'ms" data-pkg="' + escHtml(app.packageName) + '" onclick="toggleApp(\'' + escHtml(app.packageName) + '\')">' +
                    '<img class="app-icon" src="ksu://icon/' + escHtml(app.packageName) + '" onerror="this.style.display=\'none\'">' +
                    '<div class="app-info">' +
                        '<div class="app-name">' + escHtml(app.appLabel || app.packageName) + '</div>' +
                        '<div class="app-pkg">' + escHtml(app.packageName) + '</div>' +
                    '</div>' +
                    '<div class="app-check"></div>' +
                '</div>'
            );
        }

        listEl.innerHTML = html.length ? html.join("") : '<div class="app-loading">无可用应用</div>';
        listEl.classList.remove("app-list-ready");
        void listEl.offsetHeight;
        listEl.classList.add("app-list-ready");

        var count = Object.keys(selectedApps).length;
        var countEl = document.getElementById("selected-count");
        if (countEl) countEl.textContent = count > 0 ? "已选 " + count + " 个" : "";
    }

    function toggleApp(pkg) {
        if (selectedApps[pkg]) {
            delete selectedApps[pkg];
        } else {
            selectedApps[pkg] = true;
        }

        var items = document.querySelectorAll('.app-item[data-pkg="' + pkg + '"]');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle("selected");
        }

        var count = Object.keys(selectedApps).length;
        var countEl = document.getElementById("selected-count");
        if (countEl) countEl.textContent = count > 0 ? "已选 " + count + " 个" : "";

        saveAppList();
    }

    function filterApps(query) {
        var items = document.querySelectorAll(".app-item");
        var q = query.toLowerCase();
        for (var i = 0; i < items.length; i++) {
            var nameEl = items[i].querySelector(".app-name");
            var pkgEl = items[i].querySelector(".app-pkg");
            var name = nameEl ? nameEl.textContent.toLowerCase() : "";
            var pkg = pkgEl ? pkgEl.textContent.toLowerCase() : "";
            if (!q || name.indexOf(q) >= 0 || pkg.indexOf(q) >= 0) {
                items[i].style.display = "";
            } else {
                items[i].style.display = "none";
            }
        }
    }

    function refreshChargeStatus() {
        var cmd = "cat /sys/class/power_supply/battery/status 2>/dev/null;" +
                  "cat /sys/class/power_supply/battery/capacity 2>/dev/null;" +
                  "cat /sys/class/power_supply/battery/temp 2>/dev/null;" +
                  "cat /sys/class/power_supply/battery/current_now 2>/dev/null";
        ksuExec(cmd).then(function (r) {
            applyChargeData(r.stdout);
        });
    }

    var refreshing = false;
    function refreshStatus() {
        if (refreshing) return;
        refreshing = true;

        var cmd =
            "PID=$(/system/bin/cat " + MODDIR + "/state/Vehemence.pid 2>/dev/null); echo \"$PID\"; kill -0 $PID 2>/dev/null && echo alive || echo dead; echo " + DELIM + "; " +
            "tail -1 " + MODDIR + "/state/runtime.log 2>/dev/null; echo " + DELIM + "; " +
            "/system/bin/cat " + MODDIR + "/state/discover.list 2>/dev/null";

        ksuExec(cmd).then(function (r) {
            var parts = r.stdout.split(DELIM);
            if (parts.length >= 3) {
                applyDaemonStatus(parts[0]);
                applyLogLine(parts[1]);
                applyNodeList(parts[2].trim());
            }
        }).then(function () {
            refreshing = false;
        }, function () {
            refreshing = false;
        });
    }

    window.onSliderInput = function (type, val) {
        var display = document.getElementById(type + "-value");
        if (display) {
            display.textContent = val;
            display.classList.remove("value-pulse");
            void display.offsetHeight;
            display.classList.add("value-pulse");
        }
    };

    function doSaveConfig(prefix, type, toastLabel) {
        var sliderId = prefix ? prefix + type + "-slider" : type + "-slider";
        var cardId = prefix ? prefix + type + "-card" : type + "-card";
        var keyPrefix = prefix ? prefix.replace(/-/g, "_") : "";
        var key = keyPrefix + type + "_temp_mc";

        var slider = document.getElementById(sliderId);
        if (!slider) return;

        var min = parseInt(slider.min, 10);
        var max = parseInt(slider.max, 10);
        var deg = parseInt(slider.value, 10);
        if (isNaN(deg)) return;
        deg = Math.max(min, Math.min(max, deg));
        var mc = deg * 1000;

        var oldMc = configValues[key];
        configValues[key] = mc;

        var btn = document.querySelector("#" + cardId + " .btn-save");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "保存中…";
        }

        writeConfigFile().then(function (r) {
            var ok = (r.errno === 0);
            if (ok) {
                ksudSet(key, String(mc));
                signalDaemon();
                showToast(type.toUpperCase() + " " + toastLabel + " " + deg + "°C", "success");
                addConfigHistory(key, oldMc, mc);
            } else {
                configValues[key] = oldMc;
                showToast("保存失败: " + r.stderr, "error");
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = "保存设置";
            }
        });
    }

    window.saveConfig = function (type) {
        doSaveConfig("", type, "温度已设置为");
    };

    window.saveChargeConfig = function (type) {
        doSaveConfig("charge-", type, "充电温度已设置为");
    };

    window.saveAppConfig = function (type) {
        doSaveConfig("app-", type, "应用温度已设置为");
    };

    window.toggleHorae = function (checked) {
        var oldVal = configValues.horae_stop;
        configValues.horae_stop = checked ? 1 : 0;
        updateHoraeDesc(checked);

        writeConfigFile().then(function (r) {
            if (r.errno === 0) {
                ksudSet("horae_stop", String(configValues.horae_stop));
                signalDaemon();
                showToast(checked ? "Horae 温控服务已停止" : "Horae 温控服务已恢复", "success");
                addConfigHistory("horae_stop", oldVal, configValues.horae_stop);
            } else {
                showToast("保存失败: " + r.stderr, "error");
                var toggle = document.getElementById("horae-toggle");
                if (toggle) {
                    configValues.horae_stop = checked ? 0 : 1;
                    toggle.checked = !checked;
                    updateHoraeDesc(!checked);
                }
            }
        });
    };

    window.toggleAppTrigger = function (checked) {
        var oldVal = configValues.app_trigger;
        configValues.app_trigger = checked ? 1 : 0;
        updateAppTriggerDesc(checked);

        writeConfigFile().then(function (r) {
            if (r.errno === 0) {
                ksudSet("app_trigger", String(configValues.app_trigger));
                signalDaemon();
                showToast(checked ? "应用触发已开启" : "应用触发已关闭", "success");
                addConfigHistory("app_trigger", oldVal, configValues.app_trigger);
            } else {
                showToast("保存失败: " + r.stderr, "error");
                var toggle = document.getElementById("app-trigger-toggle");
                if (toggle) {
                    configValues.app_trigger = checked ? 0 : 1;
                    toggle.checked = !checked;
                    updateAppTriggerDesc(!checked);
                }
            }
        });
    };

    window.toggleChargeTrigger = function (checked) {
        var oldVal = configValues.charge_trigger;
        configValues.charge_trigger = checked ? 1 : 0;
        var desc = document.getElementById("charge-trigger-desc");
        if (desc) desc.textContent = checked ? "已开启，充电时使用独立温度值" : "开启后仅在充电时伪装温度，拔掉充电器自动停止伪装";

        writeConfigFile().then(function (r) {
            if (r.errno === 0) {
                ksudSet("charge_trigger", String(configValues.charge_trigger));
                signalDaemon();
                showToast(checked ? "充电触发已开启" : "充电触发已关闭", "success");
                addConfigHistory("charge_trigger", oldVal, configValues.charge_trigger);
            } else {
                showToast("保存失败: " + r.stderr, "error");
                var toggle = document.getElementById("charge-trigger-toggle");
                if (toggle) {
                    configValues.charge_trigger = checked ? 0 : 1;
                    toggle.checked = !checked;
                }
            }
        });
    };

    window.refreshStatus = refreshStatus;
    window.refreshChargeStatus = refreshChargeStatus;

    window.restartDaemon = function () {
        var btn = document.getElementById("btn-restart");
        btn.textContent = "重启中…";
        btn.disabled = true;

        ksuExec(MODDIR + "/bin/Vehemence --stop --moddir " + MODDIR + " 2>/dev/null; sleep 1; " +
                MODDIR + "/bin/Vehemence --start --moddir " + MODDIR + " &").then(function () {
            setTimeout(function () {
                btn.textContent = "重启守护进程";
                btn.disabled = false;
                showToast("守护进程已重启", "success");
                refreshStatus();
            }, 3000);
        });
    };

    window.toggleNodes = function () {
        var list = document.getElementById("node-list");
        var btn = document.querySelector("#nodes-card .btn-sm");
        list.classList.toggle("collapsed");
        if (btn) btn.textContent = list.classList.contains("collapsed") ? "展开" : "收起";
    };

    window.toggleLog = function () {
        var viewer = document.getElementById("log-viewer");
        var btn = document.getElementById("btn-log");
        var clearBtn = document.getElementById("btn-log-clear");
        var isCollapsed = viewer.classList.contains("collapsed");

        if (!isCollapsed) {
            viewer.classList.add("collapsed");
            if (btn) btn.textContent = "加载";
            return;
        }

        if (btn) btn.textContent = "加载中…";
        if (btn) btn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        ksuExec("tail -50 " + MODDIR + "/state/runtime.log 2>/dev/null").then(function (r) {
            viewer.innerHTML = renderLogHtml(r.stdout);
            requestAnimationFrame(function () {
                viewer.classList.remove("collapsed");
                if (btn) { btn.textContent = "收起"; btn.disabled = false; }
                if (clearBtn) clearBtn.disabled = false;
                setTimeout(function () {
                    viewer.scrollTo({ top: viewer.scrollHeight, behavior: 'smooth' });
                }, 360);
            });
        });
    };

    window.clearLog = function () {
        var viewer = document.getElementById("log-viewer");
        var btn = document.getElementById("btn-log");
        var clearBtn = document.getElementById("btn-log-clear");
        if (clearBtn) clearBtn.disabled = true;
        ksuExec("> " + MODDIR + "/state/runtime.log 2>/dev/null").then(function (r) {
            if (clearBtn) clearBtn.disabled = false;
            if (r.errno === 0) {
                viewer.classList.add("collapsed");
                if (btn) btn.textContent = "加载";
                setTimeout(function () {
                    viewer.innerHTML = '<div class="log-empty">暂无日志</div>';
                }, 350);
                showToast("日志已清除", "success");
            } else {
                showToast("清除失败: " + r.stderr, "error");
            }
        });
    };

    window.switchPage = switchPage;
    window.toggleTheme = toggleTheme;
    window.toggleApp = toggleApp;
    window.filterApps = filterApps;

    window.setAppFilter = function (filter) {
        appFilter = filter;
        var tabs = document.querySelectorAll(".filter-tab");
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle("active", tabs[i].dataset.filter === filter);
        }
        document.getElementById("app-search").value = "";
        renderAppList();
    };

    window.selectAllApps = function () {
        var items = document.querySelectorAll(".app-item");
        for (var i = 0; i < items.length; i++) {
            if (items[i].style.display === "none") continue;
            var pkg = items[i].dataset.pkg;
            if (pkg) selectedApps[pkg] = true;
        }
        renderAppList();
        saveAppList();
    };

    window.invertSelection = function () {
        var items = document.querySelectorAll(".app-item");
        for (var i = 0; i < items.length; i++) {
            if (items[i].style.display === "none") continue;
            var pkg = items[i].dataset.pkg;
            if (!pkg) continue;
            if (selectedApps[pkg]) {
                delete selectedApps[pkg];
            } else {
                selectedApps[pkg] = true;
            }
        }
        renderAppList();
        saveAppList();
    };

    window.deselectAllApps = function () {
        selectedApps = {};
        renderAppList();
        saveAppList();
    };

    function saveAppList() {
        if (_appListSaveTimer) clearTimeout(_appListSaveTimer);
        _appListSaveTimer = setTimeout(function () {
            var pkgList = Object.keys(selectedApps);
            var content = pkgList.length > 0 ? pkgList.join("\n") + "\n" : "";
            var cmd = "printf '%s' '" + content.replace(/'/g, "'\\''") + "' > " + MODDIR + "/state/apps.list";
            ksuExec(cmd).then(function () {
                signalDaemon();
            });
        }, 500);
    }

    function setupSliderGuards() {
        var sliders = document.querySelectorAll(".slider");
        for (var i = 0; i < sliders.length; i++) {
            (function (slider) {
                var startX, startValue, activated;
                slider.addEventListener("touchstart", function (e) {
                    startX = e.touches[0].clientX;
                    startValue = Number(slider.value);
                    activated = false;
                }, { passive: true });
                slider.addEventListener("touchmove", function (e) {
                    if (activated) return;
                    if (Math.abs(e.touches[0].clientX - startX) > 10) {
                        activated = true;
                    }
                }, { passive: true });
                slider.addEventListener("touchend", function () {
                    if (!activated) {
                        slider.value = startValue;
                        slider.dispatchEvent(new Event("input"));
                    }
                }, { passive: true });
                slider.addEventListener("touchcancel", function () {
                    slider.value = startValue;
                    slider.dispatchEvent(new Event("input"));
                    activated = false;
                }, { passive: true });
            })(sliders[i]);
        }
    }

    function hideLoading() {
        var overlay = document.getElementById("loading-overlay");
        if (overlay) {
            overlay.classList.add("fade-out");
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 300);
        }
    }

    var appListLoaded = false;

    function initLoad() {
        var cached = localStorage.getItem("v-cache");
        if (cached) {
            try {
                var c = JSON.parse(cached);
                if (c.cf) applyConfig(c.cf);
                if (c.ds) applyDaemonStatus(c.ds);
                if (c.ll) applyLogLine(c.ll);
                if (c.nl) applyNodeList(c.nl);
                if (c.ch) applyChargeData(c.ch);
            } catch (e) {}
        }

        var cmd =
            "/system/bin/cat " + MODDIR + "/state/config.prop 2>/dev/null; echo " + DELIM + "; " +
            "PID=$(/system/bin/cat " + MODDIR + "/state/Vehemence.pid 2>/dev/null); echo \"$PID\"; kill -0 $PID 2>/dev/null && echo alive || echo dead; echo " + DELIM + "; " +
            "tail -1 " + MODDIR + "/state/runtime.log 2>/dev/null; echo " + DELIM + "; " +
            "/system/bin/cat " + MODDIR + "/state/discover.list 2>/dev/null; echo " + DELIM + "; " +
            "cat /sys/class/power_supply/battery/status 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/capacity 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/temp 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/current_now 2>/dev/null" +
            "; echo " + DELIM + "; grep '^version=' " + MODDIR + "/module.prop 2>/dev/null | cut -d= -f2";

        setTimeout(function () {
            ksuExec(cmd).then(function (r) {
                if (r.errno !== 0) {
                    showToast("无法连接到模块，请检查 Root 权限", "error");
                }
                var s = r.stdout.split(DELIM);
                if (s.length >= 5) {
                    applyConfig(s[0].trim());
                    applyDaemonStatus(s[1]);
                    applyLogLine(s[2]);
                    applyNodeList(s[3].trim());
                    applyChargeData(s[4].trim());
                    try {
                        localStorage.setItem("v-cache", JSON.stringify({
                            cf: s[0].trim(), ds: s[1], ll: s[2],
                            nl: s[3].trim(), ch: s[4]
                        }));
                    } catch (e) {}
                }
                if (s.length >= 6) {
                    var versionStr = s[5].trim();
                    var footer = document.getElementById("app-version");
                    if (footer && versionStr) footer.textContent = versionStr;
                }
            });
        }, 16);
    }

    function refreshAll() {
        var cmd =
            "PID=$(/system/bin/cat " + MODDIR + "/state/Vehemence.pid 2>/dev/null); echo \"$PID\"; kill -0 $PID 2>/dev/null && echo alive || echo dead; echo " + DELIM + "; " +
            "tail -1 " + MODDIR + "/state/runtime.log 2>/dev/null; echo " + DELIM + "; " +
            "/system/bin/cat " + MODDIR + "/state/discover.list 2>/dev/null; echo " + DELIM + "; " +
            "cat /sys/class/power_supply/battery/status 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/capacity 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/temp 2>/dev/null;" +
            "cat /sys/class/power_supply/battery/current_now 2>/dev/null; echo " + DELIM + "; " +
            "cpu_max=0; gpu_max=0; ddr_val=0; bat_val=0; " +
            "for z in /sys/class/thermal/thermal_zone*; do " +
            "t=$(cat $z/type 2>/dev/null); v=$(cat $z/temp 2>/dev/null); " +
            "[ -z \"$t\" ] && continue; [ -z \"$v\" ] && continue; " +
            "case $t in cpu-*|cpuss*) [ $v -gt $cpu_max ] && cpu_max=$v;; " +
            "gpuss*) [ $v -gt $gpu_max ] && gpu_max=$v;; " +
            "ddr) ddr_val=$v;; esac; done; " +
            "bat_val=$(cat /sys/class/power_supply/battery/temp 2>/dev/null); " +
            "echo cpu_real=$cpu_max; echo gpu_real=$gpu_max; echo ddr_real=$ddr_val; echo bat_real=$bat_val";

        ksuExec(cmd).then(function (r) {
            var s = r.stdout.split(DELIM);
            if (s.length >= 4) {
                applyDaemonStatus(s[0]);
                applyLogLine(s[1]);
                applyNodeList(s[2].trim());
                applyChargeData(s[3].trim());
                try {
                    var existing = JSON.parse(localStorage.getItem("v-cache") || "{}");
                    existing.ds = s[0];
                    existing.ll = s[1];
                    existing.nl = s[2].trim();
                    existing.ch = s[3];
                    localStorage.setItem("v-cache", JSON.stringify(existing));
                } catch (e) {}
            }
            if (s.length >= 5) {
                var realTemps = s[4].trim();
                var tempMap = {};
                realTemps.split("\n").forEach(function (line) {
                    var eq = line.indexOf("=");
                    if (eq > 0) tempMap[line.substring(0, eq)] = parseInt(line.substring(eq + 1), 10);
                });
                var cpuReal = document.getElementById("real-temp-cpu");
                var gpuReal = document.getElementById("real-temp-gpu");
                var ddrReal = document.getElementById("real-temp-ddr");
                var batReal = document.getElementById("real-temp-bat");
                if (cpuReal && tempMap.cpu_real > 0) cpuReal.textContent = (tempMap.cpu_real / 1000).toFixed(1) + "°C";
                if (gpuReal && tempMap.gpu_real > 0) gpuReal.textContent = (tempMap.gpu_real / 1000).toFixed(1) + "°C";
                if (ddrReal && tempMap.ddr_real > 0) ddrReal.textContent = (tempMap.ddr_real / 1000).toFixed(1) + "°C";
                if (batReal && tempMap.bat_real > 0) batReal.textContent = (tempMap.bat_real / 10).toFixed(1) + "°C";
            }
        });
    }

    function addConfigHistory(key, oldVal, newVal) {
        var history = JSON.parse(localStorage.getItem("v-config-history") || "[]");
        history.unshift({
            t: Date.now(),
            k: key,
            o: oldVal,
            n: newVal
        });
        if (history.length > 50) history = history.slice(0, 50);
        localStorage.setItem("v-config-history", JSON.stringify(history));
        renderConfigHistory();
    }

    function renderConfigHistory() {
        var container = document.getElementById("config-history-list");
        if (!container) return;
        var history = JSON.parse(localStorage.getItem("v-config-history") || "[]");
        if (history.length === 0) {
            container.innerHTML = '<p class="card-desc" style="text-align:center;padding:16px 0">暂无变更记录</p>';
            return;
        }
        var keyNames = {
            batt_temp_mc: "电池", cpu_temp_mc: "CPU", gpu_temp_mc: "GPU", ddr_temp_mc: "DDR",
            charge_batt_temp_mc: "充电·电池", charge_cpu_temp_mc: "充电·CPU",
            charge_gpu_temp_mc: "充电·GPU", charge_ddr_temp_mc: "充电·DDR",
            app_batt_temp_mc: "应用·电池", app_cpu_temp_mc: "应用·CPU",
            app_gpu_temp_mc: "应用·GPU", app_ddr_temp_mc: "应用·DDR",
            horae_stop: "Horae 温控服务", app_trigger: "应用触发", charge_trigger: "充电触发"
        };
        var html = "";
        history.forEach(function (h) {
            var d = new Date(h.t);
            var time = (d.getMonth() + 1) + "/" + d.getDate() + " " +
                String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
            var name = keyNames[h.k] || h.k;
            var oldDisplay = typeof h.o === "number" && h.o > 1000 ? (h.o / 1000) + "\u00B0C" : h.o;
            var newDisplay = typeof h.n === "number" && h.n > 1000 ? (h.n / 1000) + "\u00B0C" : h.n;
            html += '<div class="history-item"><span class="history-time">' + escHtml(time) +
                '</span><span class="history-key">' + escHtml(name) +
                '</span><span class="history-val">' + escHtml(String(oldDisplay)) + ' \u2192 ' + escHtml(String(newDisplay)) + '</span></div>';
        });
        container.innerHTML = html;
    }

    window.clearConfigHistory = function () {
        localStorage.removeItem("v-config-history");
        renderConfigHistory();
        showToast("变更记录已清空", "success");
    };

    window.toggleAppTempCards = function () {
        var body = document.getElementById("app-temp-body");
        var chevron = document.getElementById("app-temp-chevron");
        var subtitle = document.getElementById("app-temp-subtitle");
        var stack = body ? body.closest(".card-stack") : null;
        if (body.classList.contains("collapsed")) {
            body.classList.remove("collapsed");
            if (chevron) chevron.classList.add("expanded");
            if (subtitle) subtitle.style.display = "";
            if (stack) stack.classList.remove("is-collapsed");
        } else {
            body.classList.add("collapsed");
            if (chevron) chevron.classList.remove("expanded");
            if (subtitle) subtitle.style.display = "none";
            if (stack) stack.classList.add("is-collapsed");
        }
    };

    window.toggleHistoryCard = function () {
        var body = document.getElementById("config-history-body");
        var btn = document.getElementById("history-toggle-btn");
        if (body.classList.contains("collapsed")) {
            body.classList.remove("collapsed");
            if (btn) btn.textContent = "收起";
            renderConfigHistory();
        } else {
            body.classList.add("collapsed");
            if (btn) btn.textContent = "展开";
        }
    };

    function showGuide() {
        var guideKey = "v-guide-done-" + MODULE_VERSION;
        if (localStorage.getItem(guideKey)) return;
        var steps = [
            { title: "欢迎使用狂暴温控", text: "手机发热时系统会自动降低性能保护硬件，但这也会导致游戏掉帧、卡顿。狂暴温控通过伪装温度传感器的读数，让系统认为手机很凉爽，从而不再限制性能，释放芯片的潜力。" },
            { title: "Horae 温控服务", text: "你的手机内置了 Horae、thermal-engine 等多个温控服务。模块启动后会默认压制 thermal-engine、CPU 频率约束（freq_qos / cpufreq_bouncing / omrg / migt）以及 cooling_device，无需手动操作。此开关仅控制 Horae 服务的启停——开启则停止 Horae，关闭则恢复。建议保持开启。" },
            { title: "温度调节", text: "每个滑块对应一个传感器：BAT 是壳温度（影响温控墙阈值）、CPU/GPU/DDR 是各芯片温度。数值越低，系统越认为凉爽，性能限制越少。建议从默认值开始，根据实际体验微调。过低的壳温度可能导致充电降速，请留意。" },
            { title: "智能触发", text: "底部导航栏的「应用」页面可以选择指定应用，只在这些应用运行时才使用独立温度值，退出后自动恢复全局设定。「充电」页面可以单独设置充电时的温度，用较低值保护电池寿命。两种触发互不影响，可同时使用。" }
        ];
        var currentStep = 0;
        var overlay = document.createElement("div");
        overlay.className = "guide-overlay";
        var card = document.createElement("div");
        card.className = "guide-card";
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function renderStep() {
            var s = steps[currentStep];
            var isLast = currentStep === steps.length - 1;
            card.innerHTML =
                '<div class="guide-step-indicator">' + (currentStep + 1) + ' / ' + steps.length + '</div>' +
                '<h3 class="guide-title">' + s.title + '</h3>' +
                '<p class="guide-text">' + s.text + '</p>' +
                '<button class="guide-btn" onclick="window._guideNext()">' + (isLast ? "开始使用" : "下一步") + '</button>';
        }

        window._guideNext = function () {
            currentStep++;
            if (currentStep >= steps.length) {
                localStorage.setItem(guideKey, "1");
                overlay.classList.add("fade-out");
                setTimeout(function () { overlay.remove(); }, 400);
                delete window._guideNext;
            } else {
                renderStep();
            }
        };
        renderStep();
        requestAnimationFrame(function () { overlay.classList.add("visible"); });
    }

    window.resetGuide = function () {
        var guideKey = "v-guide-done-" + MODULE_VERSION;
        localStorage.removeItem(guideKey);
        showGuide();
    };

    document.addEventListener("DOMContentLoaded", function () {
        loadTheme();

        if (typeof ksu !== "undefined" && ksu.fullScreen) {
            ksu.fullScreen(true);
        }

        updateAppTriggerDesc(false);

        initLoad();

        setupSliderGuards();

        var navInd = document.getElementById("nav-indicator");
        if (navInd) {
            navInd.style.transition = "none";
            updateNavIndicator("thermal");
            void navInd.offsetHeight;
            navInd.style.transition = "";
        }

        hideLoading();
        showGuide();

        var refreshInterval = setInterval(refreshAll, 12000);

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                clearInterval(refreshInterval);
            } else {
                refreshAll();
                refreshInterval = setInterval(refreshAll, 12000);
            }
        });
    });
})();
