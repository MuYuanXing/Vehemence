(function () {
    "use strict";

    var MODULE_ID = "Vehemence";
    var MODDIR = "/data/adb/modules/" + MODULE_ID;
    var callbackSeq = 0;
    var configValues = {
        batt_temp_mc: 34000,
        cpu_temp_mc: 40000,
        gpu_temp_mc: 40000,
        ddr_temp_mc: 40000
    };

    function ksuExec(cmd) {
        if (typeof ksu === "undefined" || !ksu.exec) {
            return Promise.resolve({ errno: -1, stdout: "", stderr: "ksu not available" });
        }
        return new Promise(function (resolve) {
            var cbName = "cb_" + Date.now() + "_" + (++callbackSeq);
            var timer = setTimeout(function () {
                delete window[cbName];
                resolve({ errno: -1, stdout: "", stderr: "timeout" });
            }, 10000);
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
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function isValidPid(s) {
        return /^\d+$/.test(s);
    }

    function writeConfigFile() {
        var path = MODDIR + "/state/config.prop";
        var batt = String(Math.floor(configValues.batt_temp_mc));
        var cpu = String(Math.floor(configValues.cpu_temp_mc));
        var gpu = String(Math.floor(configValues.gpu_temp_mc));
        var ddr = String(Math.floor(configValues.ddr_temp_mc));
        var cmd = "printf '%s\\n' 'batt_temp_mc=" + batt + "' 'cpu_temp_mc=" + cpu +
                  "' 'gpu_temp_mc=" + gpu + "' 'ddr_temp_mc=" + ddr + "' > " + path;
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

    function loadConfig() {
        ksuExec("/system/bin/cat " + MODDIR + "/state/config.prop 2>/dev/null").then(function (r) {
            var text = r.stdout.trim();
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

            var map = [
                { key: "batt_temp_mc", slider: "batt-slider", display: "batt-value" },
                { key: "cpu_temp_mc",  slider: "cpu-slider",  display: "cpu-value" },
                { key: "gpu_temp_mc",  slider: "gpu-slider",  display: "gpu-value" },
                { key: "ddr_temp_mc",  slider: "ddr-slider",  display: "ddr-value" }
            ];
            map.forEach(function (m) {
                var slider = document.getElementById(m.slider);
                var display = document.getElementById(m.display);
                if (!slider) return;
                var min = parseInt(slider.min, 10);
                var max = parseInt(slider.max, 10);
                var deg = Math.max(min, Math.min(max, Math.round(configValues[m.key] / 1000)));
                slider.value = deg;
                if (display) display.textContent = deg;
            });
        });
    }

    window.onSliderInput = function (type, val) {
        var display = document.getElementById(type + "-value");
        if (display) display.textContent = val;
    };

    window.saveConfig = function (type) {
        var slider = document.getElementById(type + "-slider");
        if (!slider) return;

        var min = parseInt(slider.min, 10);
        var max = parseInt(slider.max, 10);
        var deg = parseInt(slider.value, 10);
        if (isNaN(deg)) return;
        deg = Math.max(min, Math.min(max, deg));
        var mc = deg * 1000;
        var key = type + "_temp_mc";

        configValues[key] = mc;

        var btn = document.querySelector("#" + type + "-card .btn-save");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "\u4fdd\u5b58\u4e2d\u2026";
        }

        writeConfigFile().then(function (r) {
            var ok = (r.errno === 0);
            if (ok) {
                ksudSet(key, String(mc));
                signalDaemon();
                showToast(type.toUpperCase() + " \u6e29\u5ea6\u5df2\u8bbe\u7f6e\u4e3a " + deg + "\u00b0C", "success");
            } else {
                showToast("\u4fdd\u5b58\u5931\u8d25: " + r.stderr, "error");
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = "\u4fdd\u5b58\u8bbe\u7f6e";
            }
        });
    };

    var refreshing = false;
    window.refreshStatus = function () {
        if (refreshing) return;
        refreshing = true;

        var done = 0;
        function checkDone() { if (++done >= 3) refreshing = false; }

        ksuExec("/system/bin/cat " + MODDIR + "/state/Vehemence.pid 2>/dev/null").then(function (r) {
            var pid = r.stdout.trim();
            var dot = document.getElementById("status-dot");
            var statusEl = document.getElementById("daemon-status");

            if (!pid || !isValidPid(pid)) {
                dot.className = "status-dot error";
                statusEl.textContent = "\u672a\u8fd0\u884c";
                checkDone();
                return;
            }

            ksuExec("kill -0 " + pid + " 2>/dev/null && echo alive || echo dead").then(function (r2) {
                var alive = r2.stdout.trim() === "alive";
                dot.className = alive ? "status-dot active" : "status-dot error";
                statusEl.textContent = alive ? "\u8fd0\u884c\u4e2d (PID " + pid + ")" : "\u5df2\u505c\u6b62";
                checkDone();
            });
        });

        ksuExec("tail -1 " + MODDIR + "/state/runtime.log 2>/dev/null").then(function (r) {
            var line = r.stdout.trim();
            if (line) {
                var m;
                m = line.match(/round=(\d+)/);
                if (m) document.getElementById("daemon-round").textContent = m[1];

                m = line.match(/nodes=(\d+)/);
                if (m) document.getElementById("daemon-nodes").textContent = m[1];

                m = line.match(/mounted_total=(\d+)/);
                if (m) document.getElementById("daemon-mounts").textContent = m[1];
            }
            checkDone();
        });

        ksuExec("/system/bin/cat " + MODDIR + "/state/discover.list 2>/dev/null").then(function (r) {
            var text = r.stdout.trim();
            var counts = { batt: 0, cpu: 0, gpu: 0, ddr: 0 };
            var nodeList = document.getElementById("node-list");

            if (!text) {
                nodeList.innerHTML = "";
                document.getElementById("n-batt").textContent = 0;
                document.getElementById("n-cpu").textContent = 0;
                document.getElementById("n-gpu").textContent = 0;
                document.getElementById("n-ddr").textContent = 0;
                checkDone();
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
                    escHtml(cls.toUpperCase()) + '</span>' + escHtml(path) + '</div>'
                );
            });

            document.getElementById("n-batt").textContent = counts.batt;
            document.getElementById("n-cpu").textContent = counts.cpu;
            document.getElementById("n-gpu").textContent = counts.gpu;
            document.getElementById("n-ddr").textContent = counts.ddr;
            nodeList.innerHTML = nodeHtml.join("");
            checkDone();
        });
    };

    window.restartDaemon = function () {
        var btn = document.getElementById("btn-restart");
        btn.textContent = "\u91cd\u542f\u4e2d\u2026";
        btn.disabled = true;

        ksuExec(MODDIR + "/bin/Vehemence --stop --moddir " + MODDIR + " 2>/dev/null; sleep 1; " +
                MODDIR + "/bin/Vehemence --start --moddir " + MODDIR + " &").then(function () {
            setTimeout(function () {
                btn.textContent = "\u91cd\u542f\u5b88\u62a4\u8fdb\u7a0b";
                btn.disabled = false;
                showToast("\u5b88\u62a4\u8fdb\u7a0b\u5df2\u91cd\u542f", "success");
                refreshStatus();
            }, 3000);
        });
    };

    window.toggleNodes = function () {
        var list = document.getElementById("node-list");
        var btn = document.querySelector("#nodes-card .btn-sm");
        list.classList.toggle("collapsed");
        if (btn) btn.textContent = list.classList.contains("collapsed") ? "\u5c55\u5f00" : "\u6536\u8d77";
    };

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
        if (!text) return '<div class="log-empty">\u6682\u65e0\u65e5\u5fd7</div>';
        var lines = text.trim().split("\n");
        var html = [];
        for (var i = 0; i < lines.length; i++) {
            var parsed = formatLogLine(lines[i]);
            if (!parsed) continue;
            html.push(
                '<div class="log-line">' +
                    '<div class="log-round">\u8f6e\u6b21 #' + escHtml(parsed.round) + '</div>' +
                    '<div class="log-detail">' +
                        '<span>\u8282\u70b9 ' + escHtml(parsed.nodes) + '</span>' +
                        '<span>\u7535\u6c60 ' + escHtml(parsed.batt) + '</span>' +
                        '<span>\u5904\u7406\u5668 ' + escHtml(parsed.cpu) + '</span>' +
                        '<span>\u56fe\u5f62 ' + escHtml(parsed.gpu) + '</span>' +
                        '<span>\u5185\u5b58 ' + escHtml(parsed.ddr) + '</span>' +
                    '</div>' +
                    '<div class="log-detail">' +
                        '<span>\u672c\u8f6e\u6302\u8f7d ' + escHtml(parsed.mounts) + '</span>' +
                        '<span>\u603b\u6302\u8f7d ' + escHtml(parsed.mounted_total) + '</span>' +
                        '<span>\u4fee\u6b63 ' + escHtml(parsed.flaps) + '</span>' +
                        '<span>\u4f11\u7720 ' + escHtml(parsed.sleep) + 's</span>' +
                    '</div>' +
                '</div>'
            );
        }
        return html.length ? html.join("") : '<div class="log-empty">\u6682\u65e0\u65e5\u5fd7</div>';
    }

    window.clearLog = function () {
        ksuExec("> " + MODDIR + "/state/runtime.log 2>/dev/null").then(function (r) {
            if (r.errno === 0) {
                var viewer = document.getElementById("log-viewer");
                viewer.innerHTML = '<div class="log-empty">\u6682\u65e0\u65e5\u5fd7</div>';
                showToast("\u65e5\u5fd7\u5df2\u6e05\u9664", "success");
            } else {
                showToast("\u6e05\u9664\u5931\u8d25: " + r.stderr, "error");
            }
        });
    };

    window.toggleLog = function () {
        var viewer = document.getElementById("log-viewer");
        var btn = document.getElementById("btn-log");
        var isCollapsed = viewer.classList.contains("collapsed");

        if (!isCollapsed) {
            viewer.classList.add("collapsed");
            if (btn) btn.textContent = "\u52a0\u8f7d";
            return;
        }

        if (btn) btn.textContent = "\u52a0\u8f7d\u4e2d\u2026";
        ksuExec("tail -50 " + MODDIR + "/state/runtime.log 2>/dev/null").then(function (r) {
            viewer.innerHTML = renderLogHtml(r.stdout);
            viewer.classList.remove("collapsed");
            viewer.scrollTop = viewer.scrollHeight;
            if (btn) btn.textContent = "\u6536\u8d77";
        });
    };

    var statusInterval;
    document.addEventListener("DOMContentLoaded", function () {
        if (typeof ksu !== "undefined" && ksu.fullScreen) {
            ksu.fullScreen(true);
        }

        loadConfig();
        refreshStatus();
        statusInterval = setInterval(refreshStatus, 15000);

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                clearInterval(statusInterval);
            } else {
                refreshStatus();
                statusInterval = setInterval(refreshStatus, 15000);
            }
        });
    });
})();
