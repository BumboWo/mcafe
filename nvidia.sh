#!/bin/bash

gum spin -s line --title="Checking GPU..." -- sleep 2

GPU_INFO="$(lspci | grep -Ei 'nvidia|vmware')"

# =========================
# NVIDIA DETECTED
# =========================
if echo "$GPU_INFO" | grep -qi nvidia; then
  echo "NVIDIA GPU detected. Installing NVIDIA drivers..."

  KERNEL_HEADERS="$(pacman -Qqs '^linux(-zen|-lts|-hardened)?$' | head -1)-headers"

  if echo "$GPU_INFO" | grep -qE "RTX [2-9][0-9]|GTX 16"; then
    PACKAGES=(nvidia-open-dkms nvidia-utils lib32-nvidia-utils libva-nvidia-driver)
  elif echo "$GPU_INFO" | grep -qE "GTX 9|GTX 10|Quadro P"; then
    PACKAGES=(nvidia-580xx-dkms nvidia-580xx-utils lib32-nvidia-580xx-utils)
  fi

  if [ -z "${PACKAGES+x}" ]; then
    echo "Sorry! No compatible NVIDIA driver found."
    exit 0
  fi

  sudo pacman -S --noconfirm --needed "$KERNEL_HEADERS" "${PACKAGES[@]}"

  echo "options nvidia_drm modeset=1" | sudo tee /etc/modprobe.d/nvidia.conf >/dev/null

  MKINITCPIO_CONF="/etc/mkinitcpio.conf"
  NVIDIA_MODULES="nvidia nvidia_modeset nvidia_uvm nvidia_drm"

  sudo cp "$MKINITCPIO_CONF" "${MKINITCPIO_CONF}.backup"
  sudo sed -i -E 's/ nvidia_drm//g; s/ nvidia_uvm//g; s/ nvidia_modeset//g; s/ nvidia//g;' "$MKINITCPIO_CONF"
  sudo sed -i -E "s/^(MODULES=\\()/\\1${NVIDIA_MODULES} /" "$MKINITCPIO_CONF"
  sudo sed -i -E 's/  +/ /g' "$MKINITCPIO_CONF"

  sudo mkinitcpio -P

  HYPRLAND_CONF="$HOME/.config/hypr/hyprland.conf"
  if [ -f "$HYPRLAND_CONF" ]; then
    cat >>"$HYPRLAND_CONF" <<'EOF'

# NVIDIA environment variables
env = NVD_BACKEND,direct
env = LIBVA_DRIVER_NAME,nvidia
env = __GLX_VENDOR_LIBRARY_NAME,nvidia
EOF
  fi

# =========================
# VMWARE DETECTED
# =========================
elif echo "$GPU_INFO" | grep -qi vmware; then
  echo "VMware GPU detected. Skipping NVIDIA setup."

  echo "Installing VMware graphics stack..."
  sudo pacman -S --noconfirm --needed mesa mesa-utils vulkan-icd-loader xf86-video-vmware open-vm-tools

  sudo systemctl enable vmtoolsd.service

# =========================
# UNKNOWN GPU
# =========================
else
  echo "No NVIDIA or VMware GPU detected. Skipping GPU-specific setup."
fi