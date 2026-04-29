import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from pycaret.classification import load_model, predict_model
import uvicorn
from groq import Groq
from supabase import create_client, Client
import africastalking

# --- Initialize Database (Supabase) ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_KEY environment variable.")
db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Initialize Africa's Talking (SMS Gateway) ---
AT_USERNAME = os.getenv("AT_USERNAME", "sandbox")
AT_API_KEY = os.getenv("AT_API_KEY")
sms = None
if AT_API_KEY:
    africastalking.initialize(AT_USERNAME, AT_API_KEY)
    sms = africastalking.SMS

# --- Initialize Groq (Generative AI) ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

COD_USERNAME = os.getenv("COD_USERNAME", "cod_sci")
COD_PASSWORD = os.getenv("COD_PASSWORD", "change_me_cod_password")
DEAN_USERNAME = os.getenv("DEAN_USERNAME", "dean_sci")
DEAN_PASSWORD = os.getenv("DEAN_PASSWORD", "change_me_dean_password")

# 1. Load the PyCaret Engine (Predictive AI)
model_path = os.getenv(
    "RISK_MODEL_PATH",
    str(Path(__file__).resolve().parent / "ml" / "production_risk_pipeline")
)
print("Warming up the AI Engines...")
risk_model = load_model(model_path)

# 2. Initialize the core API Engine
app = FastAPI(
    title="School of Computing - AI Command Center",
    description="Proactive Intelligence Engine for CoD and Dean",
    version="3.0.0"
)

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 3. Data Structures
class StudentData(BaseModel):
    Year: int
    GPA: float
    Score: float
    Attendance: float
    Study_Hours: float
    Failures: int
    Credits: int


class LoginCredentials(BaseModel):
    username: str
    password: str


# SMS Data Structure
class SMSRequest(BaseModel):
    reg_no: str
    phone_number: str
    risk_probability: float


# --- 0. SECURE AUTHENTICATION GATEWAY ---
@app.post("/auth/login")
async def login_system(creds: LoginCredentials):
    if creds.username == COD_USERNAME and creds.password == COD_PASSWORD:
        return {"status": "success", "role": "CoD", "name": "Dr. Chairperson", "token": "mock-jwt-cod"}
    elif creds.username == DEAN_USERNAME and creds.password == DEAN_PASSWORD:
        return {"status": "success", "role": "Dean", "name": "Prof. Dean", "token": "mock-jwt-dean"}
    else:
        return {"status": "error", "message": "Invalid administrative credentials."}


# --- AFRICA'S TALKING SMS DISPATCHER ---
@app.post("/notify-student")
async def notify_student(req: SMSRequest):
    if sms is None:
        return {"status": "error", "message": "SMS gateway not configured. Set AT_API_KEY in environment."}

    message = f"MUST Early Warning System: Student {req.reg_no}, your academic risk profile is currently at {req.risk_probability}%. Please visit the CoD's office immediately for academic advising."
    try:
        response = sms.send(message, [req.phone_number])
        return {"status": "success", "response": response}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# --- 1. PROACTIVE DEPARTMENT ALERT (WITH NULL SAFETY NET) ---
@app.get("/department-alert")
async def get_department_alerts():
    students_data = db.table("students").select("*").execute().data
    grades_data = db.table("grades").select("*").execute().data

    student_dict = {s['id']: s for s in students_data}
    at_risk_records = [g for g in grades_data if g['attendance_percent'] < 70.0 or not g['is_passed']]

    grouped = {}
    for record in at_risk_records:
        student = student_dict.get(record['student_id'])
        if not student:
            continue

        # THE FIX: Check if department is missing or null, and assign a clean label
        dept = student.get('department')
        if not dept or dept == "null":
            dept = "Unassigned / General Registry"

        if dept not in grouped:
            grouped[dept] = []

        existing_regs = [s['reg_no'] for s in grouped[dept]]
        if student['student_number'] not in existing_regs:
            grouped[dept].append({
                "reg_no": student['student_number'],
                "gpa": round((record['score'] / 100) * 4.0, 2),
                "attendance": record['attendance_percent'],
                "score": record['cat_score'],
                "failures": 1 if not record['is_passed'] else 0
            })

    for dept in grouped:
        grouped[dept] = grouped[dept][:5]

    return {
        "total_alerts": sum(len(v) for v in grouped.values()),
        "grouped_alerts": grouped
    }


# --- 2. THE REGISTRY SEARCH ENDPOINT ---
@app.get("/database-audit/{reg_no:path}")
async def audit_student_from_db(reg_no: str):
    student_res = db.table("students").select("*").eq("student_number", reg_no).execute()

    if not student_res.data:
        return {"error": f"Student {reg_no} not found in the SCI Registry."}

    student = student_res.data[0]
    grades_res = db.table("grades").select("*").eq("student_id", student['id']).execute()
    records = grades_res.data

    if not records:
        return {"error": f"No academic records found for {reg_no}."}

    total_attendance = sum(r['attendance_percent'] for r in records)
    avg_attendance = round(total_attendance / len(records), 1)
    total_cat = sum(r['cat_score'] for r in records)
    avg_cat = round(total_cat / len(records), 1)
    total_study = sum(r['study_hours_per_week'] for r in records)
    avg_study = round(total_study / len(records), 1)
    failures = sum(1 for r in records if not r['is_passed'])
    avg_score = sum(r['score'] for r in records) / len(records)
    estimated_gpa = round((avg_score / 100) * 4.0, 2)

    compiled_data = StudentData(
        Year=student['year_of_study'],
        GPA=estimated_gpa,
        Score=avg_cat,
        Attendance=avg_attendance,
        Study_Hours=avg_study,
        Failures=failures,
        Credits=15
    )

    ai_report = await predict_student_risk(compiled_data)

    return {
        "student_profile": {
            "name": f"{student['first_name']} {student['last_name']}",
            "reg_no": student['student_number'],
            "program": student['program'],
            "department": student.get('department') or "Unassigned"
        },
        "metrics": compiled_data.model_dump(),
        "ai_analysis": ai_report
    }


# --- 3. EXISTING: AI PREDICTION ENDPOINT (WITH OUTCOME FORECASTER) ---
@app.post("/predict-risk")
async def predict_student_risk(student: StudentData):
    input_df = pd.DataFrame([student.model_dump()])
    predictions = predict_model(risk_model, data=input_df)
    predicted_class = int(predictions.iloc[0]['prediction_label'])
    confidence = float(predictions.iloc[0]['prediction_score'])

    # --- ENTERPRISE HEURISTIC OVERRIDE ---
    if student.GPA < 2.0 or student.Attendance < 50.0 or student.Failures >= 2 or student.Score < 30.0:
        predicted_class = 1
        confidence = max(confidence, 0.85)

    status = "At Risk" if predicted_class == 1 else "Safe"

    # --- FORECASTING ENGINE ---
    cat_out_of_30 = round((student.Score / 100) * 30, 1)

    attendance_factor = student.Attendance / 100.0
    gpa_factor = min(student.GPA / 4.0, 1.0)
    failure_penalty = student.Failures * 3

    predicted_exam_score = round((70 * ((attendance_factor * 0.6) + (gpa_factor * 0.4))) - failure_penalty, 1)
    predicted_exam_score = max(0.0, min(70.0, predicted_exam_score))

    total_forecast_score = round(cat_out_of_30 + predicted_exam_score)

    if total_forecast_score >= 70:
        forecasted_grade = "A"
    elif total_forecast_score >= 60:
        forecasted_grade = "B"
    elif total_forecast_score >= 50:
        forecasted_grade = "C"
    elif total_forecast_score >= 40:
        forecasted_grade = "D"
    else:
        forecasted_grade = "FAIL"

    reasons = []
    if student.Attendance < 75.0:
        reasons.append(f"🔴 Critical: Attendance is dangerously low ({student.Attendance}%).")
    if student.Failures > 0:
        reasons.append(f"🔴 Warning: History of {student.Failures} failed course(s) detected.")
    if student.GPA < 2.5:
        reasons.append(f"🟠 Warning: GPA of {student.GPA} is below the recommended safety threshold.")
    if student.Study_Hours < 5.0:
        reasons.append(f"🟡 Note: Low self-study engagement ({student.Study_Hours} hours/week).")

    prompt = f"""
    You are an expert AI Data Scientist presenting a high-priority risk report to the Chairperson of Department (CoD).

    Student Metrics: CAT Score {student.Score}/100, Attendance {student.Attendance}%, GPA {student.GPA}, Failures {student.Failures}.
    Forecasted Final Grade: {forecasted_grade} (Projected Total: {total_forecast_score}/100)
    AI Prediction: {status} ({round(confidence * 100, 2)}% confidence).

    Structure your response into 3 short, punchy paragraphs:
    1. Executive Summary: State the student's current status and highlight their forecasted final grade of '{forecasted_grade}'. DO NOT invent any mathematical correlations. Only use the metrics provided above.
    2. Explainable AI Insights: Briefly explain why low attendance or past failures heavily impact the final predicted exam outcome.
    3. Suggested Intervention: Suggest a realistic university intervention (e.g., academic advising) and explicitly mention using the 'What-If Policy Simulator'.
    """

    if client is None:
        ai_advice = "Groq client not configured. Set GROQ_API_KEY in environment to enable AI advisor output."
    else:
        try:
            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
                temperature=0.3,
                max_tokens=600
            )
            ai_advice = chat_completion.choices[0].message.content.strip()
        except Exception as e:
            ai_advice = f"Groq API Error: {str(e)}"

    return {
        "status": status,
        "risk_probability": round(confidence * 100, 2),
        "explanation": reasons[:3],
        "ai_advisor_summary": ai_advice,
        "forecast": {
            "cat_score": cat_out_of_30,
            "exam_prediction": predicted_exam_score,
            "total_score": total_forecast_score,
            "grade": forecasted_grade
        }
    }


# --- 4. POLICY SIMULATOR ---
@app.post("/simulate-policy")
async def simulate_policy_change(student: StudentData, added_study_hours: float = 0.0):
    input_data = student.model_dump()

    orig_df = pd.DataFrame([input_data])
    orig_pred_class = int(predict_model(risk_model, data=orig_df).iloc[0]['prediction_label'])
    orig_risk = float(predict_model(risk_model, data=orig_df).iloc[0]['prediction_score'])

    if input_data['GPA'] < 2.0 or input_data['Attendance'] < 50.0 or input_data['Failures'] >= 2 or input_data[
        'Score'] < 30.0:
        orig_risk = max(orig_risk, 0.85)

    input_data['Study_Hours'] += added_study_hours
    input_data['Attendance'] = min(100.0, input_data['Attendance'] + (added_study_hours * 2))
    input_data['GPA'] = min(4.0, input_data['GPA'] + (added_study_hours * 0.05))

    sim_df = pd.DataFrame([input_data])
    sim_pred_class = int(predict_model(risk_model, data=sim_df).iloc[0]['prediction_label'])
    sim_risk = float(predict_model(risk_model, data=sim_df).iloc[0]['prediction_score'])

    if input_data['GPA'] < 2.0 or input_data['Attendance'] < 50.0 or input_data['Failures'] >= 2:
        sim_risk = max(sim_risk, 0.85)

    reduction = orig_risk - sim_risk

    return {
        "original_risk_percent": round(orig_risk * 100, 2),
        "simulated_risk_percent": round(sim_risk * 100, 2),
        "policy_impact": f"Risk reduced by {round(reduction * 100, 2)}%" if reduction > 0 else "No significant change."
    }


# --- 5. EXECUTIVE SUMMARY ---
@app.get("/executive-summary")
async def get_morning_briefing():
    students_data = db.table("students").select("id").execute().data
    grades_data = db.table("grades").select("attendance_percent, score, is_passed").execute().data

    total_students = len(students_data)

    if total_students == 0 or not grades_data:
        return {"title": "Daily Executive Briefing", "content": "Awaiting Database Initialization.", "metrics": {}}

    at_risk_count = sum(1 for g in grades_data if not g['is_passed'] or g['attendance_percent'] < 65.0)
    unique_at_risk_estimate = int(at_risk_count / 3)
    safe_rate = round(((total_students - unique_at_risk_estimate) / total_students) * 100, 1)
    avg_attendance = round(sum(g['attendance_percent'] for g in grades_data) / len(grades_data), 1)
    avg_score = round(sum(g['score'] for g in grades_data) / len(grades_data), 1)
    avg_gpa = round((avg_score / 100) * 4.0, 2)

    briefing = (
        f"The School of Computing is currently tracking {total_students} registered students across {len(grades_data)} active course units. "
        f"The overall SCI departmental safe rate is {safe_rate}%. "
        f"Currently, {unique_at_risk_estimate} students are flagged by the Early Warning System. "
        f"Average GPA is {avg_gpa}, with attendance averaging {avg_attendance}%."
    )

    return {
        "title": "Daily Executive Briefing",
        "content": briefing,
        "metrics": {"total_students": total_students, "safe_rate": safe_rate, "at_risk_count": unique_at_risk_estimate}
    }


# --- 6. DEAN'S STRATEGIC ANALYTICS ---
@app.get("/dean-analytics")
async def get_dean_analytics():
    students = db.table("students").select("id, department").execute().data
    grades = db.table("grades").select("student_id, attendance_percent, score, is_passed").execute().data

    if not students or not grades:
        return {"error": "Insufficient data for analytics."}

    student_dept_map = {s['id']: s.get('department', 'Unknown') for s in students}
    dept_stats = {}

    for grade in grades:
        dept = student_dept_map.get(grade['student_id'])
        if not dept:
            continue

        if dept not in dept_stats:
            dept_stats[dept] = {
                "total_records": 0,
                "total_attendance": 0.0,
                "total_score": 0.0,
                "passed_records": 0
            }

        dept_stats[dept]["total_records"] += 1
        dept_stats[dept]["total_attendance"] += grade['attendance_percent']
        dept_stats[dept]["total_score"] += grade['score']
        if grade['is_passed']:
            dept_stats[dept]["passed_records"] += 1

    analytics_result = {}
    for dept, stats in dept_stats.items():
        total = stats["total_records"]
        if total > 0:
            analytics_result[dept] = {
                "avg_attendance": round(stats["total_attendance"] / total, 1),
                "avg_score": round(stats["total_score"] / total, 1),
                "pass_rate": round((stats["passed_records"] / total) * 100, 1)
            }

    return analytics_result


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)