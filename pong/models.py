from django.db import models
from authentication.models import User
from django.conf import settings

class PongGame(models.Model):
    class Status(models.TextChoices):
        ONGOING = 'ongoing'
        FINISHED = 'finished'

    room = models.ForeignKey('PongRoom', related_name='games', on_delete=models.CASCADE, null=True, blank=True)
    player1 = models.ForeignKey(User, related_name='player1_games', on_delete=models.CASCADE, null=True, blank=True)
    player2 = models.ForeignKey(User, related_name='player2_games', on_delete=models.CASCADE, null=True, blank=True)
    player2_is_ai = models.BooleanField(default=False)
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ONGOING)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"PONGGAME[{self.id}]: {self.status}"

    def get_state(self):
        return {
            'player1': self.player1.username if self.player1 else 'Unknown',
            'player2': self.player2.username if self.player2 else 'AI',
            'score_player1': self.player1_score,
            'score_player2': self.player2_score,
            'status': self.status,
        }

class PongRoom(models.Model):
    class Mode(models.TextChoices):
        AI = 'AI', 'AI'
        CLASSIC = 'CLASSIC', 'Classic'
        RANKED = 'RANKED', 'Ranked'
        TOURNAMENT = 'TOURNAMENT', 'Tournament'

    room_id = models.CharField(max_length=10, unique=True)
    players = models.ManyToManyField(User, related_name='pong_rooms')
    pending_invitations = models.ManyToManyField(User, related_name='pending_pong_invitations')
    mode = models.CharField(max_length=20, choices=Mode.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_pong_rooms', null=True)

    def __str__(self):
        return f"PONGROOM[{self.room_id}]: {self.mode}"

    def get_ongoing_games(self):
        return self.games.filter(status=PongGame.Status.ONGOING)

    def get_finished_games(self):
        return self.games.filter(status=PongGame.Status.FINISHED)

    @property
    def max_players(self):
        if self.mode == self.Mode.TOURNAMENT:
            return 8  # ou le nombre maximum de joueurs pour un tournoi
        else:
            return 2  # pour les modes AI, CLASSIC et RANKED

    def save(self, *args, **kwargs):
        # Assurez-vous que le mode est en majuscules
        self.mode = self.mode.upper()
        super().save(*args, **kwargs)
