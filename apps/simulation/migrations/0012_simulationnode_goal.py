from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("simulation", "0011_attemptreport")]

    operations = [
        migrations.AddField(
            model_name="simulationnode",
            name="goal",
            field=models.TextField(blank=True, db_default="", default=""),
        ),
        migrations.AlterField(model_name="simulationnode", name="decision_prompt", field=models.TextField(blank=True, db_default="", default="")),
        migrations.AlterField(model_name="decisionoption", name="immediate_feedback", field=models.TextField(blank=True, default="")),
    ]

