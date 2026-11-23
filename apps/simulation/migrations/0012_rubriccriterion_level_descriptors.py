from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("simulation", "0011_attemptreport")]

    operations = [
        migrations.AddField(
            model_name="rubriccriterion",
            name="level_descriptors_json",
            field=models.TextField(default="{}", db_default="{}"),
        ),
    ]
