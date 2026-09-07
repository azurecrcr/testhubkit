from __future__ import annotations

import os

from flask import Blueprint, jsonify, request, send_file

from core.config import UPLOADS_DIR
from core.services.test_cases import fill_test_cases_to_excel, parse_test_cases


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-case-importer", methods=["POST"])
    def test_case_importer():
        try:
            if "excel_file" not in request.files:
                return jsonify({"error": "请上传Excel文件"})

            excel_file = request.files["excel_file"]
            if excel_file.filename == "":
                return jsonify({"error": "请选择一个Excel文件"})
            if not excel_file.filename.lower().endswith((".xlsx", ".xls")):
                return jsonify({"error": "请上传Excel文件(.xlsx或.xls)"})

            test_cases_text = request.form.get("test_cases", "")
            if not test_cases_text:
                return jsonify({"error": "请输入测试用例数据"})

            filepath = os.path.join(UPLOADS_DIR, excel_file.filename)
            excel_file.save(filepath)

            try:
                test_cases = parse_test_cases(test_cases_text)
                filled_count = fill_test_cases_to_excel(filepath, test_cases)
                response = send_file(
                    filepath,
                    as_attachment=True,
                    download_name=excel_file.filename,
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                response.headers["X-Filled-Count"] = str(filled_count)

                @response.call_on_close
                def cleanup():
                    try:
                        os.remove(filepath)
                    except Exception as cleanup_err:
                        print(f"清理临时文件时出错: {str(cleanup_err)}")

                return response
            except Exception as exc:
                return jsonify({"error": f"处理Excel文件时出错: {str(exc)}"})
        except Exception as exc:
            return jsonify({"error": str(exc)})
