import os
import sys
import django
import pandas as pd

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Problem

def import_companies(excel_path):
    print(f"Loading data from {excel_path}...")
    try:
        df = pd.read_excel(excel_path, header=1)
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return

    # Fill NaN values with empty string
    df['Companies'] = df['Companies'].fillna('')
    
    updated_count = 0
    not_found_count = 0
    
    print(f"Found {len(df)} rows in Excel.")
    
    for index, row in df.iterrows():
        url = str(row.get('URL', ''))
        companies = row.get('Companies', '')
        
        if not url or pd.isna(url) or 'leetcode.com/problems' not in url:
            continue
            
        slug = url.rstrip('/').split('/')[-1]
        
        try:
            problem = Problem.objects.get(slug=slug)
            comp_str = str(companies).strip()
            # Handle cases where Excel might have generic placeholders like '999' or 'No'
            if comp_str and comp_str not in ('999', 'No', 'nan'):
                problem.companies = comp_str
                problem.save()
                updated_count += 1
        except Problem.DoesNotExist:
            not_found_count += 1
        except Problem.MultipleObjectsReturned:
            print(f"Warning: Multiple problems found for slug '{slug}'")
            
    print(f"--- Data Backfill Complete ---")
    print(f"Successfully updated companies for {updated_count} problems.")
    print(f"Total problems present in Excel but not in database: {not_found_count}")

if __name__ == "__main__":
    excel_path = r"C:\Users\Delight\Downloads\leetcode_problems.xlsx"
    import_companies(excel_path)
