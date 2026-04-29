const API_URL = "http://127.0.0.1:8000";

let passRateChartInstance = null;
let engagementChartInstance = null;
let currentUserRole = null;

// --- SECURE AUTHENTICATION LOGIC ---
async function attemptLogin() {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if(!user || !pass) {
        errorDiv.innerText = "Please enter both username and password.";
        errorDiv.classList.remove('hidden');
        return;
    }

    btn.innerText = "AUTHENTICATING...";
    btn.disabled = true;
    errorDiv.classList.add('hidden');

    try {
        const resp = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({username: user, password: pass})
        });
        const data = await resp.json();

        if (data.status === "success") {
            currentUserRole = data.role;
            document.getElementById('user-role-badge').innerText = data.role;

            if (data.role === "Dean") {
                document.getElementById('header-title').innerText = "Dean's Strategic Monitor";
                document.getElementById('nav-audit').classList.add('hidden');
                document.getElementById('nav-forecast').classList.add('hidden');
                document.getElementById('nav-reports').classList.remove('hidden');
            } else if (data.role === "CoD") {
                document.getElementById('header-title').innerText = "Chairperson's Monitor";
                document.getElementById('nav-audit').classList.remove('hidden');
                document.getElementById('nav-forecast').classList.remove('hidden');
                document.getElementById('nav-reports').classList.add('hidden');
            }

            const overlay = document.getElementById('auth-overlay');
            overlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => { overlay.classList.add('hidden'); }, 500);

            loadView('dashboard');
        } else {
            errorDiv.innerText = data.message;
            errorDiv.classList.remove('hidden');
        }
    } catch (err) {
        errorDiv.innerText = "Connection Error. Ensure FastAPI is running.";
        errorDiv.classList.remove('hidden');
    } finally {
        btn.innerText = "AUTHENTICATE";
        btn.disabled = false;
    }
}

function logout() {
    currentUserRole = null;
    document.getElementById('login-username').value = "";
    document.getElementById('login-password').value = "";
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('app-content').innerHTML = "";

    const overlay = document.getElementById('auth-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0', 'pointer-events-none'); }, 10);
}

// --- THE ROUTER ---
async function loadView(viewName) {
    const contentDiv = document.getElementById('app-content');
    contentDiv.innerHTML = '<div class="text-center text-slate-500 mt-20 font-bold animate-pulse">Loading System Module...</div>';

    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error("Module not found");

        const html = await response.text();
        contentDiv.innerHTML = html;

        if (viewName === 'dashboard') initDashboard();
        else if (viewName === 'audit') initRegistry();
        else if (viewName === 'reports') initReports();
        else if (viewName === 'forecaster') { /* Just load HTML */ }
    } catch (error) {
        contentDiv.innerHTML = `<div class="text-red-500 bg-red-100 p-4 rounded text-center mt-20 font-bold">Error loading module.</div>`;
    }
}

// --- DASHBOARD LOGIC ---
async function initDashboard() {
    try {
        const resp = await fetch(`${API_URL}/executive-summary`);
        const data = await resp.json();
        document.getElementById('briefing-title').innerText = data.title;
        document.getElementById('briefing-content').innerText = data.content;
        if(data.metrics.total_students) {
            document.getElementById('kpi-total').innerText = data.metrics.total_students;
            document.getElementById('kpi-safe').innerText = data.metrics.safe_rate + "%";
            document.getElementById('kpi-risk').innerText = data.metrics.at_risk_count;
        }
    } catch (err) { console.error("Could not load executive summary."); }
}

// --- REGISTRY LOGIC ---
async function initRegistry() {
    try {
        const resp = await fetch(`${API_URL}/department-alert`);
        const data = await resp.json();
        if(document.getElementById('alert-text')) document.getElementById('alert-text').innerText = `Active scanning complete. Found ${data.total_alerts} high-risk correlations requiring intervention.`;
        if(document.getElementById('alert-count')) document.getElementById('alert-count').innerText = data.total_alerts;

        const container = document.getElementById('course-container');
        if(!container) return;
        container.innerHTML = "";

        for (const [course, students] of Object.entries(data.grouped_alerts)) {
            const div = document.createElement('div');
            div.className = "bg-white p-6 rounded-2xl shadow-sm border-t-4 border-blue-500 hover:shadow-md transition";
            div.innerHTML = `
                <h4 class="font-bold text-slate-800 mb-4 flex justify-between items-center">
                    ${course}
                    <span class="text-[10px] text-blue-500">${students.length} Flags</span>
                </h4>
                <div class="space-y-3">
                    ${students.slice(0, 3).map(s => `
                        <div onclick="searchStudentDB('${s.reg_no}')" class="risk-card bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-100">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-black text-slate-400 uppercase">${s.reg_no}</span>
                                <span class="text-xs font-bold text-slate-700">GPA: ${s.gpa}</span>
                            </div>
                            <span class="text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black uppercase">${s.attendance}% Att.</span>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(div);
        }
    } catch (err) { console.error("Could not load registry data."); }
}

async function searchStudentDB(forceRegNo = null) {
    const regNo = forceRegNo || document.getElementById('search-reg').value.trim();
    if(!regNo) return alert("Please enter a valid Registration Number.");

    const btn = document.getElementById('search-btn');
    const originalText = btn.innerText;
    btn.innerText = "SCANNING..."; btn.disabled = true;

    const resultArea = document.getElementById('analysis-result');
    const aiReportBox = document.getElementById('res-ai');
    resultArea.classList.remove('hidden');
    aiReportBox.innerHTML = `<div class="animate-pulse text-slate-400">Retrieving records & running AI...</div>`;

    try {
        const resp = await fetch(`${API_URL}/database-audit/${regNo}`);
        const data = await resp.json();

        if (data.error) {
            alert(data.error);
            aiReportBox.innerHTML = "<span class='text-red-500'>Student not found.</span>";
            return;
        }

        document.getElementById('student-profile-card').classList.remove('hidden');
        document.getElementById('prof-name').innerText = data.student_profile.name;
        document.getElementById('prof-reg').innerText = data.student_profile.reg_no;
        document.getElementById('prof-dept').innerText = data.student_profile.department;
        document.getElementById('prof-prog').innerText = data.student_profile.program;

        document.getElementById('GPA').value = data.metrics.GPA;
        document.getElementById('Attendance').value = data.metrics.Attendance;
        document.getElementById('Score').value = data.metrics.Score;
        document.getElementById('Failures').value = data.metrics.Failures;

        renderAIReport(data.ai_analysis);
    } catch (error) {
        aiReportBox.innerHTML = "Backend offline.";
    } finally {
        btn.innerText = originalText; btn.disabled = false;
        document.getElementById('analysis-result').scrollIntoView({ behavior: 'smooth' });
    }
}

async function analyzeManual() {
    const gpa = document.getElementById('GPA').value;
    const att = document.getElementById('Attendance').value;
    const score = document.getElementById('Score').value;
    const fail = document.getElementById('Failures').value;
    if(!gpa || !att || !score) return alert("Fill all metrics.");

    const studentData = { Year: 3, GPA: parseFloat(gpa), Score: parseFloat(score), Attendance: parseFloat(att), Study_Hours: 2.0, Failures: parseInt(fail) || 0, Credits: 15 };
    const btn = document.getElementById('audit-btn');
    btn.innerText = "PROCESSING..."; btn.disabled = true;

    try {
        const resp = await fetch(`${API_URL}/predict-risk`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(studentData) });
        renderAIReport(await resp.json());
    } catch (err) {} finally { btn.innerText = "RUN OVERRIDE / RE-ANALYZE DATA"; btn.disabled = false; }
}

function updateSimLabel(val) { document.getElementById('sim-hours-label').innerText = "+" + val; }
function resetSimulator(initialRisk) {
    const slider = document.getElementById('sim-slider');
    if(slider) {
        slider.value = 0; updateSimLabel(0);
        document.getElementById('sim-orig-risk').innerText = initialRisk + "%";
        document.getElementById('sim-new-risk').innerText = initialRisk + "%";
        document.getElementById('sim-impact').innerText = "Baseline Model";
    }
}
async function runSimulation() {
    const addedHours = parseFloat(document.getElementById('sim-slider').value);
    const data = { Year: 3, GPA: parseFloat(document.getElementById('GPA').value), Score: parseFloat(document.getElementById('Score').value), Attendance: parseFloat(document.getElementById('Attendance').value), Study_Hours: 2.0, Failures: parseInt(document.getElementById('Failures').value) || 0, Credits: 15 };

    document.getElementById('sim-impact').innerText = "Calculating...";
    try {
        const resp = await fetch(`${API_URL}/simulate-policy?added_study_hours=${addedHours}`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data) });
        const res = await resp.json();
        document.getElementById('sim-new-risk').innerText = res.simulated_risk_percent + "%";
        document.getElementById('sim-impact').innerText = res.policy_impact;
    } catch (err) {}
}

async function sendSMSAlert() {
    const phone = document.getElementById('sms-phone').value.trim();
    const regNo = document.getElementById('prof-reg').innerText;
    const riskText = document.getElementById('res-badge').innerText;
    const statusEl = document.getElementById('sms-status');
    const btn = document.getElementById('sms-btn');

    if(!phone || !phone.startsWith("+")) {
        statusEl.innerText = "Error: Use international format (e.g. +254...).";
        statusEl.classList.remove('hidden', 'text-green-400');
        statusEl.classList.add('text-red-400');
        return;
    }

    btn.innerText = "SENDING...";
    btn.disabled = true;
    statusEl.classList.add('hidden');

    const riskProb = riskText.match(/\d+/)[0];

    try {
        const resp = await fetch(`${API_URL}/notify-student`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                reg_no: regNo !== "--" ? regNo : "UNKNOWN",
                phone_number: phone,
                risk_probability: parseFloat(riskProb)
            })
        });
        const data = await resp.json();

        statusEl.classList.remove('hidden', 'text-red-400');
        if(data.status === "success") {
            statusEl.innerText = "Success! SMS dispatched via Africa's Talking.";
            statusEl.classList.add('text-green-400');
        } else {
            statusEl.innerText = "Failed: " + data.message;
            statusEl.classList.add('text-red-400');
        }
    } catch(err) {
        statusEl.innerText = "Connection error to FastAPI.";
        statusEl.classList.remove('hidden', 'text-green-400');
        statusEl.classList.add('text-red-400');
    } finally {
        btn.innerText = "SEND WARNING SMS";
        btn.disabled = false;
    }
}

function renderAIReport(res) {
    document.getElementById('analysis-result').classList.remove('hidden');
    const header = document.getElementById('res-header');
    const badge = document.getElementById('res-badge');
    const smsWidget = document.getElementById('sms-widget');

    if(res.status === "At Risk") {
        header.className = "p-6 text-white font-bold bg-red-600 flex justify-between items-center";
        badge.style.color = "#dc2626";
        smsWidget.classList.remove('hidden');
    } else {
        header.className = "p-6 text-white font-bold bg-green-600 flex justify-between items-center";
        badge.style.color = "#16a34a";
        smsWidget.classList.add('hidden');
    }

    badge.innerText = `${res.status} (${res.risk_probability}%)`;
    document.getElementById('res-reasons').innerHTML = res.explanation.map(text => `<li class="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm"><span class="text-blue-500">▶</span><span class="text-xs font-bold text-slate-700">${text}</span></li>`).join('');
    document.getElementById('res-ai').innerText = res.ai_advisor_summary;
    resetSimulator(res.risk_probability);
}

// --- NEW: FORECASTER LOGIC (OBJECTIVE 2) ---
async function runForecast() {
    const regNo = document.getElementById('forecast-reg').value.trim();
    if(!regNo) return alert("Please enter a valid Registration Number.");

    const btn = document.getElementById('forecast-btn');
    const originalText = btn.innerText;
    btn.innerText = "CALCULATING..."; btn.disabled = true;

    try {
        const resp = await fetch(`${API_URL}/database-audit/${regNo}`);
        const data = await resp.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Student Info
        document.getElementById('fc-name').innerText = data.student_profile.name;
        document.getElementById('fc-reg').innerText = data.student_profile.reg_no;
        document.getElementById('fc-confidence').innerText = data.ai_analysis.risk_probability + "%";

        // --- THE RAW FEATURE VECTOR (Bragging Rights Data) ---
        // Added the % sign for clarity
        document.getElementById('raw-cat').innerText = data.metrics.Score + "%";
        document.getElementById('raw-att').innerText = data.metrics.Attendance + "%";
        document.getElementById('raw-gpa').innerText = data.metrics.GPA;
        document.getElementById('raw-fail').innerText = data.metrics.Failures;
        document.getElementById('raw-study').innerText = data.metrics.Study_Hours;
        document.getElementById('raw-cred').innerText = data.metrics.Credits;

        // Forecast Metrics
        const fc = data.ai_analysis.forecast;
        document.getElementById('val-cat').innerText = fc.cat_score;
        document.getElementById('val-exam').innerText = fc.exam_prediction;
        document.getElementById('val-total').innerText = fc.total_score;

        // Color Grade (Typo fixed!)
        const gradeEl = document.getElementById('val-grade');
        gradeEl.innerText = fc.grade;
        gradeEl.className = "text-7xl font-black relative z-10";
        if(fc.grade === "FAIL") gradeEl.classList.add("text-red-500");
        else if(fc.grade === "D") gradeEl.classList.add("text-orange-500");
        else if(fc.grade === "C") gradeEl.classList.add("text-yellow-400");
        else gradeEl.classList.add("text-green-400");

        // Explaining the Factors
        document.getElementById('fac-att').innerText = data.metrics.Attendance + "%";
        document.getElementById('fac-gpa').innerText = data.metrics.GPA;
        document.getElementById('fac-fail').innerText = data.metrics.Failures;

        // Reveal
        document.getElementById('forecast-results').classList.remove('hidden');

    } catch (error) {
        alert("Connection error to FastAPI. Make sure the backend is running.");
    } finally {
        btn.innerText = originalText; btn.disabled = false;
    }
}

// --- DEAN'S STRATEGIC REPORTS LOGIC ---
async function initReports() {
    try {
        const resp = await fetch(`${API_URL}/dean-analytics`);
        const data = await resp.json();

        const departments = Object.keys(data);
        const passRates = departments.map(d => data[d].pass_rate);
        const attendances = departments.map(d => data[d].avg_attendance);
        const scores = departments.map(d => data[d].avg_score);

        const tbody = document.getElementById('analytics-table-body');
        tbody.innerHTML = "";
        departments.forEach(dept => {
            const stats = data[dept];
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-bold text-slate-700">${dept.replace("Department of ", "")}</td>
                    <td class="px-6 py-4 text-center font-mono ${stats.avg_attendance < 70 ? 'text-red-500 font-bold' : 'text-slate-600'}">${stats.avg_attendance}%</td>
                    <td class="px-6 py-4 text-center font-mono">${stats.avg_score}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${stats.pass_rate < 50 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${stats.pass_rate}%</span>
                    </td>
                </tr>
            `;
        });

        if(passRateChartInstance) passRateChartInstance.destroy();
        if(engagementChartInstance) engagementChartInstance.destroy();

        const ctx1 = document.getElementById('passRateChart').getContext('2d');
        passRateChartInstance = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: departments.map(d => d.replace("Department of ", "")),
                datasets: [{
                    label: 'Pass Rate (%)',
                    data: passRates,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderRadius: 6
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        });

        const ctx2 = document.getElementById('engagementChart').getContext('2d');
        engagementChartInstance = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: departments.map(d => d.replace("Department of ", "")),
                datasets: [
                    { label: 'Avg Attendance (%)', data: attendances, borderColor: 'rgba(168, 85, 247, 1)', backgroundColor: 'rgba(168, 85, 247, 0.2)', fill: true, tension: 0.4 },
                    { label: 'Avg CAT Score (Out of 30/100 scaled)', data: scores, borderColor: 'rgba(16, 185, 129, 1)', borderDash: [5, 5], tension: 0.4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

    } catch (err) {
        console.error("Error loading analytics:", err);
        document.getElementById('analytics-table-body').innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load from database.</td></tr>`;
    }
}

// --- PDF EXPORT LOGIC ---
function downloadDeanReport() {
    const element = document.getElementById('pdf-report-content');
    const btnText = document.getElementById('export-btn-text');
    const originalText = btnText.innerText;

    btnText.innerText = "GENERATING PDF...";

    const opt = {
        margin:       [0.5, 0.5, 0.5, 0.5],
        filename:     'MUST_SCI_Strategic_Report.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        btnText.innerText = originalText;
    });
}