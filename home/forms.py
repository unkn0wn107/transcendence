from django import forms
from authentication.models import User

class ProfileForm(forms.Form):
    name = forms.CharField(max_length=30, widget=forms.TextInput(attrs={'class': 'form-control'}))
    nick_name = forms.CharField(max_length=10, widget=forms.TextInput(attrs={'class': 'form-control'}))
    email = forms.EmailField(widget=forms.EmailInput(attrs={'class': 'form-control'}))
    date_of_birth = forms.DateField(widget=forms.DateInput(attrs={'class': 'form-control', 'placeholder': 'YYYY-MM-DD'}), input_formats=['%Y-%m-%d'], required=False)
    bio = forms.CharField(max_length=500, widget=forms.Textarea(attrs={'class': 'form-control'}), required=False)
    profile_picture = forms.ImageField(widget=forms.FileInput(attrs={'class': 'form-control'}), required=False)

    def __init__(self, *args, **kwargs):
        item_id = kwargs.pop('item_id')
        super(ProfileForm, self).__init__(*args, **kwargs)
        user = User.objects.get(username=item_id)
        self.fields['name'].initial = user.username
        self.fields['nick_name'].initial = user.nick_name 
        self.fields['email'].initial = user.email
        self.fields['date_of_birth'].initial = user.date_of_birth
        self.fields['bio'].initial = user.bio

    def save(self, commit=True):
        user = User.objects.get(username=self.cleaned_data['name'])
        user.username = self.cleaned_data['name']
        user.email = self.cleaned_data['email']
        user.nick_name = self.cleaned_data['nick_name']
        user.date_of_birth = self.cleaned_data['date_of_birth']
        user.bio = self.cleaned_data['bio']
        if self.cleaned_data['profile_picture']:
            user.profile_picture = self.cleaned_data['profile_picture']
        if commit:
            user.save()
        return user