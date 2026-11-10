import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Notificacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(max_length=40)),
                ('titulo', models.CharField(max_length=200)),
                ('cuerpo', models.TextField()),
                ('leida', models.BooleanField(default=False)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('correo_enviado', models.BooleanField(default=False)),
                ('error_correo', models.TextField(blank=True, default='')),
                ('destinatario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notificaciones', to=settings.AUTH_USER_MODEL)),
                ('originador', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='notificaciones_originadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-creada_en', '-pk'],
            },
        ),
    ]
