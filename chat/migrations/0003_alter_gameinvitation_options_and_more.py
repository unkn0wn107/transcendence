# Generated by Django 5.0.7 on 2024-07-25 18:57

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0002_create_gameinvitation'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='gameinvitation',
            options={},
        ),
        migrations.AlterField(
            model_name='gameinvitation',
            name='game_id',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='gameinvitation',
            name='recipient',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_game_invitations', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='gameinvitation',
            name='sender',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_game_invitations', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterUniqueTogether(
            name='gameinvitation',
            unique_together={('sender', 'recipient', 'game_id')},
        ),
    ]