import Swal from "sweetalert2";

const baseOptions = {
  confirmButtonColor: "#2f6fed",
  background: "#ffffff",
  color: "#17202a"
};

export function showErrorAlert(title: string, text: string) {
  return Swal.fire({
    ...baseOptions,
    icon: "error",
    title,
    text
  });
}

export function showSuccessAlert(title: string, text: string) {
  return Swal.fire({
    ...baseOptions,
    icon: "success",
    title,
    text,
    timer: 1800,
    showConfirmButton: false
  });
}

export function showSuccessToast(title: string) {
  return Swal.fire({
    ...baseOptions,
    toast: true,
    position: "top-end",
    icon: "success",
    title,
    timer: 1800,
    showConfirmButton: false,
    timerProgressBar: true
  });
}

export function showWarningAlert(title: string, text: string) {
  return Swal.fire({
    ...baseOptions,
    icon: "warning",
    title,
    text
  });
}
