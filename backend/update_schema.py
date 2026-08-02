import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Problem

try:
    p = Problem.objects.get(id=1670)
    schema = {
        'kind': 'design',
        'class_name': 'FrontMiddleBackQueue',
        'methods': {
            'FrontMiddleBackQueue': {'params': [], 'return_type': 'void'},
            'pushFront': {'params': ['int'], 'return_type': 'void'},
            'pushMiddle': {'params': ['int'], 'return_type': 'void'},
            'pushBack': {'params': ['int'], 'return_type': 'void'},
            'popFront': {'params': [], 'return_type': 'int'},
            'popMiddle': {'params': [], 'return_type': 'int'},
            'popBack': {'params': [], 'return_type': 'int'}
        }
    }
    p.param_schema = schema
    p.save()
    print('Successfully updated server database schema!')
except Exception as e:
    print(f'Error updating schema: {e}')
