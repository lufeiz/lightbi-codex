package handlers

import "lightbi/backend/internal/models"

type UserDTO struct {
	ID          uint              `json:"id"`
	Username    string            `json:"username"`
	Email       *string           `json:"email"`
	Phone       *string           `json:"phone"`
	DisplayName string            `json:"displayName"`
	Role        models.UserRole   `json:"role"`
	Status      models.UserStatus `json:"status"`
}

func ToUserDTO(user models.User) UserDTO {
	return UserDTO{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		Phone:       user.Phone,
		DisplayName: user.DisplayName,
		Role:        user.Role,
		Status:      user.Status,
	}
}

func ToUserDTOs(users []models.User) []UserDTO {
	out := make([]UserDTO, 0, len(users))
	for _, user := range users {
		out = append(out, ToUserDTO(user))
	}
	return out
}
