import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_customuser_temp_password_set_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='PermisoDeAutoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('otorgado_en', models.DateTimeField(auto_now_add=True)),
                ('docente', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='permiso_autoria', to=settings.AUTH_USER_MODEL)),
                ('otorgado_por', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='permisos_otorgados', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
