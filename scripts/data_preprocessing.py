#!/usr/bin/env python3
"""
Data preprocessing utilities for raw XLSX files in scripts/data/raw.

Implements educators sheet cleaning only:
- Drop row 1 and column A
- Use row 3 as the header row
- Split 'Location' by '/' into 'Location1' and 'Location2' (drop original)
- Split 'Classroom/Environment' by '/' into dynamic 'env1..envN' (drop original)
- Drop the row where 'Educator Name' == 'Rahul Raghavan'
- Add 'Role' column: default 'teacher'; set 'admin' for specific names

Usage:
  python scripts/data_preprocessing.py \
    --input-dir scripts/data/raw \
    --output-dir scripts/data/processed

Requires:
  - pandas
  - openpyxl
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import List

import pandas as pd


RAW_EDUCATORS_FILENAME = "educators-list-uncleaned.xlsx"


@dataclass(frozen=True)
class ImportResult:
    source_path: Path
    sheet_name: str
    dataframe: pd.DataFrame


def read_excel_first_sheet(file_path: Path, header: int | None = None) -> ImportResult:
    if not file_path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    excel_file = pd.ExcelFile(file_path)
    if not excel_file.sheet_names:
        raise ValueError(f"No sheets found in: {file_path}")

    first_sheet_name = excel_file.sheet_names[0]
    df = pd.read_excel(excel_file, sheet_name=first_sheet_name, header=header, dtype=str)
    return ImportResult(source_path=file_path, sheet_name=first_sheet_name, dataframe=df)


def write_excel(df: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Ensure header is at row 1 (Excel index 1)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Sheet1", index=False, startrow=0)


def clean_educators_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Apply the requested cleaning steps to the educators sheet.

    Steps (1-based row/column language mirrors Excel UI):
    - Drop row 1 and column A
    - Make row 3 the header row
    - Split 'Location' into 'Location1' and 'Location2' by '/'
    - Split 'Classroom/Environment' by '/' into env1..envN
    """

    # Work on a copy; treat everything as string to preserve values
    df = raw_df.copy()

    # 1) Drop row 1 (Excel's first row) and column A (Excel's first column)
    df = df.drop(index=0, errors="ignore")
    df = df.drop(columns=0, errors="ignore")

    # 2) Make row 3 the header. After dropping the top padding row (row 1),
    # the original row 3 is now at positional index 1 in this dataframe.
    header_pos = 1
    header_row = df.iloc[header_pos]
    header_values = [str(v).strip() if pd.notna(v) else "" for v in header_row.tolist()]

    # Subset the data rows below the header row
    df = df.iloc[header_pos + 1 :].reset_index(drop=True)
    df.columns = header_values

    # Normalize whitespace in all string cells
    for col in df.columns:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
            .replace({"nan": ""})
        )

    # 3) Split Location into Location1 and Location2
    if "Location" in df.columns:
        loc_split = df["Location"].astype(str).str.split("/", n=1, expand=True)
        # Ensure two columns even if split yields fewer parts
        while loc_split.shape[1] < 2:
            loc_split.loc[:, loc_split.shape[1]] = ""
        df["Location1"] = loc_split.iloc[:, 0].fillna("").str.strip()
        df["Location2"] = loc_split.iloc[:, 1].fillna("").str.strip()
        df = df.drop(columns=["Location"])  # drop original

    # 4) Split Classroom/Environment into env1..envN
    env_col_name = "Classroom/Environment"
    if env_col_name in df.columns:
        # Replace line breaks with single spaces before splitting
        cleaned_env = (
            df[env_col_name]
            .astype(str)
            .str.replace(r"\s*\n\s*", " ", regex=True)
            .str.strip()
        )
        env_parts = cleaned_env.str.split("/", expand=True)
        # Assign dynamic env columns
        env_column_names: List[str] = [f"env{i+1}" for i in range(env_parts.shape[1])]
        env_parts.columns = env_column_names
        for name in env_column_names:
            df[name] = env_parts[name].fillna("").str.strip()
        df = df.drop(columns=[env_col_name])

    # 5) Drop specific educator rows and set Role
    if "Educator Name" in df.columns:
        df = df[df["Educator Name"].astype(str).str.strip() != "Rahul Raghavan"].reset_index(drop=True)
        other_names = {"Anil Kumar S", "Doreraju G", "Salam Anilkumar Singh"}
        df["Role"] = "teacher"
        df.loc[df["Educator Name"].astype(str).str.strip().isin(other_names), "Role"] = "other"

    # Remove any completely empty rows that might remain at the top or within the data
    non_empty_mask = df.apply(lambda row: row.astype(str).str.strip().ne("").any(), axis=1)
    df = df[non_empty_mask].reset_index(drop=True)

    return df


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Preprocess raw XLSX files")
    parser.add_argument(
        "--input-dir",
        default="scripts/data/raw",
        type=str,
        help="Directory containing raw XLSX files (default: scripts/data/raw)",
    )
    parser.add_argument(
        "--output-dir",
        default="scripts/data/processed",
        type=str,
        help="Directory to write outputs (default: scripts/data/processed)",
    )
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    educators_path = input_dir / RAW_EDUCATORS_FILENAME

    print("Reading educators XLSX…")
    try:
        # Read with no header so we can realign headers per instructions
        edu_import = read_excel_first_sheet(educators_path, header=None)
        print(f"Loaded educators: sheet='{edu_import.sheet_name}', shape={edu_import.dataframe.shape}")
        # Save raw (unaligned) snapshot for tracing
        write_excel(edu_import.dataframe, output_dir / "educators_raw_unaligned.xlsx")

        # Clean per spec
        edu_clean = clean_educators_dataframe(edu_import.dataframe)
        print(f"Educators cleaned shape: {edu_clean.shape}")
        write_excel(edu_clean, output_dir / "educators_clean.xlsx")
        print(f"Wrote cleaned educators XLSX → {output_dir / 'educators_clean.xlsx'}")
    except Exception as exc:  # pylint: disable=broad-except
        print(f"ERROR processing educators XLSX: {exc}")

    print("Done.")


if __name__ == "__main__":
    main()

