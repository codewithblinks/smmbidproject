 document.addEventListener('DOMContentLoaded', function () {
    // Add event listeners for the "Mark as Read" buttons
    document.querySelectorAll('.mark-as-read').forEach(button => {
      button.addEventListener('click', function (event) {
        event.preventDefault(); 
        const notificationId = this.getAttribute('data-id');
        markAsRead(notificationId);
      });
    });
  });

  function markAsRead(notificationId) {
    fetch(`/notifications/mark-as-read/${notificationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        if (response.ok) {
          // Remove the notification from the UI
          const notificationItem = document.querySelector(`li[data-id="${notificationId}"]`);
          if (notificationItem) {
            notificationItem.remove();
          }
        } else {
          console.error('Failed to mark notification as read');
        }
      })
      .catch(error => console.error('Error:', error));
  }
