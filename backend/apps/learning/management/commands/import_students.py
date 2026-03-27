import os

import pymysql
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import StudentProfile


class Command(BaseCommand):
    help = "Import students from collegeadmissiondb.personaldetails into code-2day"

    def add_arguments(self, parser):
        parser.add_argument(
            "--database-name",
            default=os.getenv("CODE2DAY_SOURCE_DB_NAME", "collegeadmissiondb"),
        )
        parser.add_argument(
            "--database-host",
            default=os.getenv("CODE2DAY_SOURCE_DB_HOST", "127.0.0.1"),
        )
        parser.add_argument(
            "--database-port",
            type=int,
            default=int(os.getenv("CODE2DAY_SOURCE_DB_PORT", "3306")),
        )
        parser.add_argument(
            "--database-user",
            default=os.getenv("CODE2DAY_SOURCE_DB_USER", "root"),
        )
        parser.add_argument(
            "--database-password",
            default=os.getenv("CODE2DAY_SOURCE_DB_PASSWORD", ""),
        )

    def handle(self, *args, **options):
        connection = pymysql.connect(
            host=options["database_host"],
            port=options["database_port"],
            user=options["database_user"],
            password=options["database_password"],
            database=options["database_name"],
            cursorclass=pymysql.cursors.DictCursor,
        )

        imported = 0
        updated = 0
        skipped = 0

        query = """
            SELECT
                Id,
                Name,
                RegisterationNumber,
                PersonalEmailID,
                PersonalMobileNo,
                Gender,
                DateOfBirth,
                FatherName,
                MotherName
            FROM personaldetails
            WHERE RegisterationNumber IS NOT NULL
              AND TRIM(RegisterationNumber) <> ''
            ORDER BY Id
        """

        with connection:
            with connection.cursor() as cursor:
                cursor.execute(query)
                rows = cursor.fetchall()

        with transaction.atomic():
            for row in rows:
                register_number = (row["RegisterationNumber"] or "").strip()
                if not register_number:
                    skipped += 1
                    continue

                profile, created = self._upsert_student(row, register_number)
                if created:
                    imported += 1
                else:
                    updated += 1

                self.stdout.write(
                    f"Synced {profile.register_number} - {profile.name}",
                    ending="\n",
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete. Imported: {imported}, updated: {updated}, skipped: {skipped}."
            )
        )

    def _upsert_student(self, row, register_number):
        email = (row.get("PersonalEmailID") or "").strip()
        name = (row.get("Name") or register_number).strip()

        user, user_created = User.objects.get_or_create(
            username=register_number,
            defaults={
                "first_name": name[:150],
                "email": email,
                "is_active": True,
            },
        )
        if user_created:
            user.set_unusable_password()
            user.save()
        else:
            fields_to_update = []
            if user.first_name != name[:150]:
                user.first_name = name[:150]
                fields_to_update.append("first_name")
            if email and user.email != email:
                user.email = email
                fields_to_update.append("email")
            if fields_to_update:
                user.save(update_fields=fields_to_update)

        profile, created = StudentProfile.objects.update_or_create(
            register_number=register_number,
            defaults={
                "account": user,
                "name": name,
                "title": "Imported from college admission database",
                "personal_email": email,
                "mobile_number": (row.get("PersonalMobileNo") or "").strip(),
                "gender": (row.get("Gender") or "").strip(),
                "date_of_birth": row.get("DateOfBirth"),
                "father_name": (row.get("FatherName") or "").strip(),
                "mother_name": (row.get("MotherName") or "").strip(),
                "source_personal_details_id": row.get("Id"),
                "import_source": "collegeadmissiondb.personaldetails",
            },
        )
        return profile, created
