from django.core.management.base import BaseCommand
from apps.learning.models import StaffProfile


class Command(BaseCommand):
    help = "Check staff names"

    def handle(self, *args, **options):
        ids = ['1608','1603','1619','1613','1605','1604','1616','1607','1618','1223','1621','1620']
        for staff in StaffProfile.objects.filter(faculty_id__in=ids):
            user_name = staff.account.first_name if staff.account else "None"
            self.stdout.write(f"{staff.faculty_id}: User={user_name}, Profile={staff.name!r}")
