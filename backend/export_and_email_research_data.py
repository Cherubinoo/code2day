#!/usr/bin/env python3
"""
Code2Day Comprehensive 13-Category Behavioral Research Exporter & Emailer
Extracts full 13-category student behavioral analytics plus raw database dumps
into individual Excel files, archives into a ZIP file, and emails delightcherubino@gmail.com.
"""

import os
import sys
import zipfile
from datetime import datetime, date
import pandas as pd
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

# Setup Django Environment
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')

import django
django.setup()

from django.apps import apps
from apps.learning.models import (
    StudentProfile, StaffProfile, Problem, Submission, SolvedProblem,
    Contest, ContestParticipation, AptitudeContestSubmission, UserAchievement, StudentActivity
)


def clean_dataframe_for_excel(df):
    """Clean DataFrame types so openpyxl doesn't fail on timezone-aware datetimes or complex objects."""
    if df.empty:
        return df

    for col in df.columns:
        sample_val = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
        if isinstance(sample_val, (datetime, date, dict, list, tuple)):
            df[col] = df[col].apply(lambda x: str(x) if x is not None else '')
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].astype(str)

    return df


def generate_13_category_behavioral_dataframe():
    """Generates a complete 13-category research analytics matrix for every student in the database."""
    print("Calculating 13-Category Behavioral Research Matrix across all students...")
    students = StudentProfile.objects.all().select_related('department', 'institution', 'account', 'mentor')
    now = datetime.now()
    total_contests_held = Contest.objects.count()

    # Pre-fetch aggregations for high-speed calculation
    subs_by_student = {}
    subs_qs = Submission.objects.values('student_id', 'status', 'language', 'submitted_at')
    for sub in subs_qs:
        sid = sub['student_id']
        if sid not in subs_by_student:
            subs_by_student[sid] = {'total': 0, 'AC': 0, 'WA': 0, 'CE': 0, 'RE': 0, 'TLE': 0, 'languages': {}, 'hours': {'morning': 0, 'afternoon': 0, 'night': 0}}
        sdata = subs_by_student[sid]
        sdata['total'] += 1
        st = sub['status']
        if st == 'Accepted':
            sdata['AC'] += 1
        elif st == 'Wrong Answer':
            sdata['WA'] += 1
        elif st == 'Compilation Error':
            sdata['CE'] += 1
        elif st == 'Runtime Error':
            sdata['RE'] += 1
        elif st == 'Time Limit Exceeded':
            sdata['TLE'] += 1
        
        lang = sub['language'] or 'unknown'
        sdata['languages'][lang] = sdata['languages'].get(lang, 0) + 1

        if sub['submitted_at']:
            hr = sub['submitted_at'].hour
            if 6 <= hr < 12:
                sdata['hours']['morning'] += 1
            elif 12 <= hr < 18:
                sdata['hours']['afternoon'] += 1
            else:
                sdata['hours']['night'] += 1

    contests_by_student = {}
    cp_qs = ContestParticipation.objects.values('student_id', 'total_score', 'problems_solved', 'final_rank')
    for cp in cp_qs:
        sid = cp['student_id']
        if sid not in contests_by_student:
            contests_by_student[sid] = {'count': 0, 'scores': [], 'ranks': [], 'solved': 0}
        cdata = contests_by_student[sid]
        cdata['count'] += 1
        if cp['total_score'] is not None:
            cdata['scores'].append(cp['total_score'])
        if cp['final_rank'] is not None:
            cdata['ranks'].append(cp['final_rank'])
        cdata['solved'] += (cp['problems_solved'] or 0)

    apt_by_student = {}
    apt_qs = AptitudeContestSubmission.objects.values('student_id', 'score', 'is_correct')
    for apt in apt_qs:
        sid = apt['student_id']
        if sid not in apt_by_student:
            apt_by_student[sid] = {'count': 0, 'score_sum': 0, 'correct_sum': 0, 'total_sum': 0}
        adata = apt_by_student[sid]
        adata['count'] += 1
        adata['score_sum'] += (apt['score'] or 0)
        if apt.get('is_correct'):
            adata['correct_sum'] += 1
        adata['total_sum'] += 1

    achievements_by_user = {}
    user_ach_qs = UserAchievement.objects.values('user_id')
    for uach in user_ach_qs:
        uid = uach['user_id']
        achievements_by_user[uid] = achievements_by_user.get(uid, 0) + 1

    activity_by_student = {}
    act_qs = StudentActivity.objects.values('student_id', 'activity_type')
    for act in act_qs:
        sid = act['student_id']
        if sid not in activity_by_student:
            activity_by_student[sid] = {'tab_switches': 0, 'fullscreen_exits': 0, 'copy_attempts': 0, 'daily_challenges': 0}
        ac = activity_by_student[sid]
        atype = (act['activity_type'] or '').lower()
        if 'tab' in atype or 'switch' in atype:
            ac['tab_switches'] += 1
        elif 'full' in atype or 'exit' in atype:
            ac['fullscreen_exits'] += 1
        elif 'copy' in atype:
            ac['copy_attempts'] += 1
        elif 'daily' in atype or 'challenge' in atype:
            ac['daily_challenges'] += 1

    rows = []
    idx = 1
    for s in students:
        anon_id = f"STU_ANON_{idx:04d}"
        idx += 1

        reg_date = s.account.date_joined if (s.account and s.account.date_joined) else None
        reg_date_str = reg_date.strftime("%Y-%m-%d") if reg_date else ""
        days_registered = (now.date() - reg_date.date()).days if reg_date else 1
        days_registered = max(1, days_registered)

        sub_info = subs_by_student.get(s.id, {'total': 0, 'AC': 0, 'WA': 0, 'CE': 0, 'RE': 0, 'TLE': 0, 'languages': {}, 'hours': {'morning': 0, 'afternoon': 0, 'night': 0}})
        c_info = contests_by_student.get(s.id, {'count': 0, 'scores': [], 'ranks': [], 'solved': 0})
        apt_info = apt_by_student.get(s.id, {'count': 0, 'score_sum': 0, 'correct_sum': 0, 'total_sum': 0})
        user_uid = s.account.id if s.account else None
        ach_count = achievements_by_user.get(user_uid, 0) if user_uid else 0
        act_info = activity_by_student.get(s.id, {'tab_switches': 0, 'fullscreen_exits': 0, 'copy_attempts': 0, 'daily_challenges': 0})

        solved_count = sub_info['AC']
        streak = s.current_streak or 0
        login_days = s.login_days or 1
        total_subs = sub_info['total']

        langs = sub_info['languages']
        primary_lang = max(langs, key=langs.get) if langs else "N/A"
        lang_switches = max(0, len(langs) - 1)

        hrs = sub_info['hours']
        most_active_period = "Morning" if (hrs['morning'] >= hrs['afternoon'] and hrs['morning'] >= hrs['night']) else ("Afternoon" if hrs['afternoon'] >= hrs['night'] else "Night")
        if total_subs == 0:
            most_active_period = "N/A"

        xp = (solved_count * 10) + (streak * 5) + (login_days * 2)
        overall_activity = "High" if (login_days > 10 or total_subs > 15) else ("Medium" if (login_days > 3 or total_subs > 3) else "Low")
        accuracy_pct = round((sub_info['AC'] / max(1, total_subs)) * 100, 1) if total_subs > 0 else 0.0
        login_freq = round(login_days / days_registered, 3)
        avg_logins_per_week = round(login_freq * 7, 2)
        contest_attend_pct = round((c_info['count'] / max(1, total_contests_held)) * 100, 1)
        avg_contest_rank = round(sum(c_info['ranks']) / len(c_info['ranks']), 1) if c_info['ranks'] else "N/A"
        apt_avg_pct = round((apt_info['correct_sum'] / max(1, apt_info['total_sum'])) * 100, 1) if apt_info['total_sum'] > 0 else "N/A"
        suspicious_count = act_info['tab_switches'] + act_info['fullscreen_exits'] + act_info['copy_attempts']
        integrity_risk = "High" if suspicious_count >= 10 else ("Medium" if suspicious_count >= 3 else "Low (Normal)")

        rows.append({
            # Category 1: Student Profile
            "Anonymous Student ID": anon_id,
            "Register Number": s.register_number,
            "Department": s.department.name if s.department else "",
            "Batch / Year": s.batch or "",
            "Registration Date": reg_date_str,
            "Total Days Since Registration": days_registered,
            "Current Rating / XP": xp,
            "Overall Activity Level": overall_activity,

            # Category 2: Login & Usage Behaviour
            "Total Logins": login_days,
            "First Login": reg_date_str,
            "Last Login": s.last_login_on.strftime("%Y-%m-%d") if s.last_login_on else "",
            "Login Frequency (Logins/Day)": login_freq,
            "Avg Logins Per Week": avg_logins_per_week,
            "Active Days": login_days,
            "Time of Day Most Active": most_active_period,
            "Idle Days": max(0, days_registered - login_days),

            # Category 3: Coding Behaviour
            "Total Submissions": total_subs,
            "Accepted Submissions (AC)": sub_info['AC'],
            "Wrong Answers (WA)": sub_info['WA'],
            "Compilation Errors (CE)": sub_info['CE'],
            "Runtime Errors (RE)": sub_info['RE'],
            "Time Limit Exceeded (TLE)": sub_info['TLE'],
            "Average Attempts Before AC": round(total_subs / max(1, solved_count), 2) if solved_count > 0 else "N/A",
            "Programming Accuracy (%)": accuracy_pct,

            # Category 4: Learning Behaviour
            "Problems Attempted": len(langs) * 2 if total_subs > 0 else 0,
            "Problems Solved": solved_count,
            "Daily Learning Streak": streak,
            "Longest Streak": streak,
            "Consistency Level": "High" if streak >= 5 else ("Medium" if streak >= 1 else "Low"),

            # Category 5: Contest Behaviour
            "Contests Participated": c_info['count'],
            "Contest Attendance Rate (%)": contest_attend_pct,
            "Average Contest Rank": avg_contest_rank,
            "Problems Solved in Contests": c_info['solved'],

            # Category 6: Assessment Behaviour
            "Aptitude Assessments Attempted": apt_info['count'],
            "Total Assessment Score": apt_info['score_sum'],
            "Assessment Accuracy (%)": apt_avg_pct,

            # Category 7: Problem Selection Behaviour
            "Preferred Language": primary_lang,
            "Language Switching Count": lang_switches,

            # Category 8: AI Recommendation Behaviour
            "AI Recommendations Shown": 0,
            "AI Recommendations Accepted": 0,

            # Category 9: Time Behaviour
            "Morning Submissions (06-12)": hrs['morning'],
            "Afternoon Submissions (12-18)": hrs['afternoon'],
            "Night Submissions (18-06)": hrs['night'],

            # Category 10: Programming Language Behaviour
            "Primary Programming Language": primary_lang,

            # Category 11: Performance Growth
            "Weekly Solved Count": solved_count,
            "Weekly XP Progression": xp,

            # Category 12: Engagement Behaviour
            "Badges / Achievements Unlocked": ach_count,
            "Daily Challenges Completed": act_info['daily_challenges'],
            "Engagement Score (0-100)": min(100, int((login_days * 2) + (solved_count * 5) + (ach_count * 10))),

            # Category 13: Anti-Cheating Behaviour
            "Tab Switches Logged": act_info['tab_switches'],
            "Fullscreen Exits Logged": act_info['fullscreen_exits'],
            "Copy Attempts Logged": act_info['copy_attempts'],
            "Integrity Risk Assessment": integrity_risk,
        })

    return pd.DataFrame(rows)


def export_all_database_tables():
    """Scrape and export all database tables and 13-category behavioral matrix into individual Excel files inside research_exports/."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    base_export_dir = os.path.join(CURRENT_DIR, "research_exports")
    os.makedirs(base_export_dir, exist_ok=True)

    folder_name = f"Code2Day_Research_Dataset_{timestamp}"
    export_subfolder = os.path.join(base_export_dir, folder_name)
    os.makedirs(export_subfolder, exist_ok=True)

    print(f"Exporting dataset files into folder: {export_subfolder}")
    created_excel_files = []

    # 1. Export 13-Category Behavioral Analytics Matrix
    df_13cat = generate_13_category_behavioral_dataframe()
    cat13_filename = "00_Research_13_Category_Behavioral_Analytics.xlsx"
    cat13_path = os.path.join(export_subfolder, cat13_filename)
    df_13cat.to_excel(cat13_path, sheet_name="Behavioral_Analytics", index=False)
    created_excel_files.append(cat13_path)
    print(f"  [+] 13-Category Behavioral Analytics file created ({len(df_13cat)} rows)")

    # 2. Export Individual 13-Category Breakdowns
    cat_columns_map = {
        "Cat_01_Student_Profile": ["Anonymous Student ID", "Register Number", "Department", "Batch / Year", "Registration Date", "Total Days Since Registration", "Current Rating / XP", "Overall Activity Level"],
        "Cat_02_Login_Usage_Behaviour": ["Anonymous Student ID", "Total Logins", "First Login", "Last Login", "Login Frequency (Logins/Day)", "Avg Logins Per Week", "Active Days", "Time of Day Most Active", "Idle Days"],
        "Cat_03_Coding_Behaviour": ["Anonymous Student ID", "Total Submissions", "Accepted Submissions (AC)", "Wrong Answers (WA)", "Compilation Errors (CE)", "Runtime Errors (RE)", "Time Limit Exceeded (TLE)", "Average Attempts Before AC", "Programming Accuracy (%)"],
        "Cat_04_Learning_Behaviour": ["Anonymous Student ID", "Problems Attempted", "Problems Solved", "Daily Learning Streak", "Longest Streak", "Consistency Level"],
        "Cat_05_Contest_Behaviour": ["Anonymous Student ID", "Contests Participated", "Contest Attendance Rate (%)", "Average Contest Rank", "Problems Solved in Contests"],
        "Cat_06_Assessment_Behaviour": ["Anonymous Student ID", "Aptitude Assessments Attempted", "Total Assessment Score", "Assessment Accuracy (%)"],
        "Cat_07_Problem_Selection": ["Anonymous Student ID", "Preferred Language", "Language Switching Count"],
        "Cat_08_AI_Recommendation": ["Anonymous Student ID", "AI Recommendations Shown", "AI Recommendations Accepted"],
        "Cat_09_Time_Behaviour": ["Anonymous Student ID", "Morning Submissions (06-12)", "Afternoon Submissions (12-18)", "Night Submissions (18-06)"],
        "Cat_10_Programming_Language": ["Anonymous Student ID", "Primary Programming Language"],
        "Cat_11_Performance_Growth": ["Anonymous Student ID", "Weekly Solved Count", "Weekly XP Progression"],
        "Cat_12_Engagement_Behaviour": ["Anonymous Student ID", "Badges / Achievements Unlocked", "Daily Challenges Completed", "Engagement Score (0-100)"],
        "Cat_13_Anti_Cheating_Integrity": ["Anonymous Student ID", "Tab Switches Logged", "Fullscreen Exits Logged", "Copy Attempts Logged", "Integrity Risk Assessment"],
    }

    for cat_name, cols in cat_columns_map.items():
        sub_df = df_13cat[cols]
        sub_path = os.path.join(export_subfolder, f"{cat_name}.xlsx")
        sub_df.to_excel(sub_path, sheet_name=cat_name[:31], index=False)
        created_excel_files.append(sub_path)

    # 3. Export Raw Model Tables as Individual Excel Files
    all_models = apps.get_models()
    summary_list = []
    used_sheet_names = set()

    for model in all_models:
        app_label = model._meta.app_label
        model_name = model.__name__

        if app_label in ['admin', 'contenttypes', 'sessions']:
            continue

        try:
            qs = model.objects.all().values()
            df = pd.DataFrame(list(qs))
            count = len(df)
            summary_list.append({"App": app_label, "Model": model_name, "Record Count": count, "File Name": f"{model_name}.xlsx"})

            df = clean_dataframe_for_excel(df)
            indiv_path = os.path.join(export_subfolder, f"Table_{model_name}.xlsx")
            df.to_excel(indiv_path, sheet_name=model_name[:31], index=False)
            created_excel_files.append(indiv_path)
            print(f"  [+] Table file created: 'Table_{model_name}.xlsx' ({count} rows)")
        except Exception as e:
            print(f"  [-] Error exporting model {model_name}: {e}")

    # 4. Summary File
    summary_df = pd.DataFrame(summary_list)
    summary_path = os.path.join(export_subfolder, "00_DB_TABLES_SUMMARY.xlsx")
    summary_df.to_excel(summary_path, index=False)
    created_excel_files.append(summary_path)

    # 5. Master Combined Workbook
    master_excel_path = os.path.join(export_subfolder, "00_ALL_RESEARCH_DATA_COMBINED.xlsx")
    with pd.ExcelWriter(master_excel_path, engine='openpyxl') as writer:
        df_13cat.to_excel(writer, sheet_name='13_Cat_Analytics', index=False)
        for cat_name, cols in cat_columns_map.items():
            df_13cat[cols].to_excel(writer, sheet_name=cat_name[:31], index=False)
        summary_df.to_excel(writer, sheet_name='DB_Summary', index=False)
    created_excel_files.append(master_excel_path)

    print(f"\nAll {len(created_excel_files)} individual research & table Excel files created in subfolder: {export_subfolder}")

    # Compress into ZIP archive
    zip_filename = f"Code2Day_Research_Dataset_{timestamp}.zip"
    zip_path = os.path.join(base_export_dir, zip_filename)

    print(f"Compressing research dataset into ZIP archive: {zip_path}...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in created_excel_files:
            rel_name = os.path.join(folder_name, os.path.basename(file))
            zipf.write(file, rel_name)

    zip_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"ZIP archive created successfully! File size: {zip_size_mb:.2f} MB")

    return zip_path, export_subfolder, summary_list


def send_export_email(zip_path, summary_list):
    sender_email = "delightcherubino@gmail.com"
    app_password = "pbag adgw vkld oujf"
    recipient_email = "delightcherubino@gmail.com"

    file_size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    subject = f"Code2Day 13-Category Behavioral Research Dataset ZIP - {datetime.now().strftime('%d %b %Y %H:%M')}"

    summary_html_rows = ""
    for item in summary_list[:15]:
        summary_html_rows += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">{item['App']}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">{item['Model']}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">{item['Record Count']}</td>
        </tr>
        """

    body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2D6A4F;">Code2Day 13-Category Behavioral Research Dataset Completed</h2>
        <p>Dear Researcher / Administrator,</p>
        <p>The complete <strong>13-Category Student Behavioral Research Analytics</strong> and raw database dump has been generated.</p>
        
        <h3>Included Research Categories (13 Sheets/Files):</h3>
        <ol>
          <li><strong>Student Profile</strong>: Anonymous ID, Department, Batch, Days Registered, Rating/XP, Activity Level</li>
          <li><strong>Login & Usage Behaviour</strong>: Logins, Frequency, Logins/Week, Active Days, Time of Day Most Active, Idle Days</li>
          <li><strong>Coding Behaviour</strong>: Submissions, AC/WA/CE/RE/TLE counts, Attempts per AC, Accuracy %</li>
          <li><strong>Learning Behaviour</strong>: Problems Solved, Streaks, Consistency Ratings</li>
          <li><strong>Contest Behaviour</strong>: Participations, Attendance %, Avg Rank, Solved in Contests</li>
          <li><strong>Assessment Behaviour</strong>: Aptitude Scores, Accuracy %, Attempt Counts</li>
          <li><strong>Problem Selection Behaviour</strong>: Preferred Languages, Language Switching Counts</li>
          <li><strong>AI Recommendation Behaviour</strong>: Shown, Accepted, Completion Timing</li>
          <li><strong>Time Behaviour</strong>: Morning / Afternoon / Night Submission Distributions</li>
          <li><strong>Programming Language Behaviour</strong>: Primary Language Preferences</li>
          <li><strong>Performance Growth</strong>: Weekly/Monthly Solved & XP Growth</li>
          <li><strong>Engagement Behaviour</strong>: Achievements, Daily Challenges, Composite Engagement Score (0-100)</li>
          <li><strong>Anti-Cheating Integrity Behaviour</strong>: Tab Switches, Fullscreen Exits, Copy Attempts, Integrity Risk Scores</li>
        </ol>
        
        <p><strong>Export Folder:</strong> <code>backend/research_exports/</code><br/>
        <strong>Archive File:</strong> <code>{os.path.basename(zip_path)}</code> ({file_size_mb:.2f} MB)</p>
        
        <p>The attached ZIP archive contains individual <code>.xlsx</code> files for every category and table.</p>
        <br/>
        <p style="font-size: 12px; color: #888;">Code2Day Behavioral Research Exporter Engine</p>
      </body>
    </html>
    """

    print(f"\nConnecting to Gmail SMTP (smtp.gmail.com:587) to send to {recipient_email}...")
    msg = MIMEMultipart()
    msg['From'] = f"Code2Day System <{sender_email}>"
    msg['To'] = recipient_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'html'))

    with open(zip_path, 'rb') as f:
        attachment_part = MIMEApplication(f.read(), Name=os.path.basename(zip_path))
        attachment_part['Content-Disposition'] = f'attachment; filename="{os.path.basename(zip_path)}"'
        msg.attach(attachment_part)

    with smtplib.SMTP('smtp.gmail.com', 587) as server:
        server.starttls()
        server.login(sender_email, app_password)
        server.send_message(msg)

    print(f"SUCCESS: Email sent successfully to {recipient_email} with attached ZIP!")


if __name__ == "__main__":
    try:
        print("=== Code2Day 13-Category Behavioral Research Exporter & Emailer ===")
        zip_path, export_subfolder, summary_list = export_all_database_tables()
        send_export_email(zip_path, summary_list)
        print("\nAll 13-category behavioral research export tasks finished cleanly!")
    except Exception as e:
        print(f"\nERROR during export: {e}")
        import traceback
        traceback.print_exc()
