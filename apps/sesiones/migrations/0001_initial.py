import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('simulation', '0005_remove_simulationattempt_simulation_attempts_v2_status_check_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Sesion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('espacio_academico', models.CharField(max_length=255)),
                ('inicio', models.DateTimeField()),
                ('fin', models.DateTimeField()),
                ('tiempo_maximo_min', models.PositiveIntegerField()),
                ('lugar', models.CharField(blank=True, max_length=255)),
                ('mensaje', models.TextField(blank=True)),
                ('estado', models.CharField(choices=[('SIN_INICIAR', 'Sin Iniciar'), ('EN_CURSO', 'En Curso'), ('FINALIZADA', 'Finalizada')], default='SIN_INICIAR', max_length=20)),
                ('case_version', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='simulation.caseversion')),
                ('creada_por', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sesiones_creadas', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Convocatoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo_hash', models.CharField(max_length=255)),
                ('estado', models.CharField(choices=[('ACTIVA', 'Activa'), ('RETIRADA', 'Retirada')], default='ACTIVA', max_length=20)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('estudiante', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='convocatorias', to=settings.AUTH_USER_MODEL)),
                ('sesion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='convocatorias', to='sesiones.sesion')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('sesion', 'estudiante'), name='sesion_estudiante_unico')],
            },
        ),
    ]
