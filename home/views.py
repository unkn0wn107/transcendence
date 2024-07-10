from authentication.decorators import custom_login_required
from authentication.models import User
from django.contrib import messages
from django.shortcuts import render, redirect
from .forms import ProfileForm
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth import login

@custom_login_required
def profile(request):
    user = request.user
    if request.method == 'POST':
        form = ProfileForm(request.POST, request.FILES, item_id=user.username)
        if form.is_valid():
            form.save()
            messages.success(request, 'Profile updated successfully.')
            return redirect('profile')
        else:
            messages.error(request, 'Profile not updated. Please correct the errors below.')
    else:
        form = ProfileForm(item_id=user.username)
    context = {'user': user, 'form': form, 'profile_picture': user.profile_picture.url if user.profile_picture else None}
    return render(request, 'profile.html', context)

@custom_login_required
def settings(request):
    return render(request, 'settings.html')

@custom_login_required
def change_password(request):
    if request.method == 'POST':
        form = PasswordChangeForm(user=request.user, data=request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Password changed successfully.')
            return render(request, 'change-password.html', {'form': form})
    else:
        form = PasswordChangeForm(user=request.user)
    return render(request, 'change-password.html', {'form': form})