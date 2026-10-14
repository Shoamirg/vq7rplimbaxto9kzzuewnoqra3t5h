class GarageException(Exception):
    """Base exception for all domain errors."""
    status_code: int = 500
    detail: str = "Internal server error"
    code: str = "INTERNAL_ERROR"


class NotFoundError(GarageException):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(GarageException):
    status_code = 409
    code = "CONFLICT"


class UnauthorizedError(GarageException):
    status_code = 401
    code = "UNAUTHORIZED"


class ForbiddenError(GarageException):
    status_code = 403
    code = "FORBIDDEN"


class ValidationError(GarageException):
    status_code = 422
    code = "VALIDATION_ERROR"


class RateLimitExceeded(GarageException):
    status_code = 429
    code = "RATE_LIMITED"
    detail = "Too many requests. Please slow down and try again shortly."

    def __init__(self, retry_after: int | None = None):
        self.retry_after = retry_after


# Domain-specific exceptions

class VehicleNotFound(NotFoundError):
    detail = "Vehicle not found"

    def __init__(self, vehicle_id=None):
        if vehicle_id:
            self.detail = f"Vehicle with id {vehicle_id} not found"


class CustomerNotFound(NotFoundError):
    detail = "Customer not found"


class AppointmentNotFound(NotFoundError):
    detail = "Appointment not found"


class MaintenanceRuleNotFound(NotFoundError):
    detail = "Maintenance rule not found"


class ServiceCenterNotFound(NotFoundError):
    detail = "Service center not found"


class UserNotFound(NotFoundError):
    detail = "User not found"


class StaffEmailUnavailable(ConflictError):
    code = "STAFF_EMAIL_UNAVAILABLE"
    detail = "Login email is unavailable"


class StaffRoleUnavailable(ValidationError):
    code = "STAFF_ROLE_UNAVAILABLE"
    detail = "Selected employee role is unavailable"


class BrandNotFound(NotFoundError):
    detail = "Brand not found"


class AppointmentConflict(ConflictError):
    code = "APPOINTMENT_CONFLICT"
    detail = "Time slot is already booked"


class AppointmentStateError(ConflictError):
    detail = "Appointment is not in a valid state for this action"
    code = "INVALID_APPOINTMENT_STATE"

    def __init__(self, detail: str | None = None):
        if detail:
            self.detail = detail


class SlotUnavailable(ConflictError):
    detail = "Requested time slot is not available"


class InvalidCredentials(UnauthorizedError):
    detail = "Invalid email or password"
    code = "INVALID_CREDENTIALS"


class TokenExpired(UnauthorizedError):
    detail = "Token has expired"
    code = "TOKEN_EXPIRED"


class InvalidToken(UnauthorizedError):
    detail = "Invalid or malformed token"
    code = "INVALID_TOKEN"


class UnauthorizedAction(ForbiddenError):
    detail = "You do not have permission to perform this action"


class DuplicateVehicle(ConflictError):
    detail = "A vehicle with this VIN already exists"
