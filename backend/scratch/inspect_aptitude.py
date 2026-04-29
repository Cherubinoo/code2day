
import pandas as pd
import os

dataset_path = r"c:\projects\ramcoad.com\problem_dataset\apptitude"
files = os.listdir(dataset_path)

if files:
    file_path = os.path.join(dataset_path, files[0])
    print(f"Inspecting file: {file_path}")
    try:
        df = pd.read_excel(file_path)
        print("Columns:", df.columns.tolist())
        print("First 2 rows:")
        print(df.head(2).to_dict(orient='records'))
    except Exception as e:
        print(f"Error reading file: {e}")
else:
    print("No files found in directory.")
