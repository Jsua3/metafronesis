import os, sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings_s3")
from django.core.management import execute_from_command_line

execute_from_command_line(sys.argv)
