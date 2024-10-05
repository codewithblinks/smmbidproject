document.addEventListener("DOMContentLoaded", function () {
    const table = document.getElementById("myTable");
    const headers = table.querySelectorAll("th");
    const rows = table.querySelectorAll("tbody tr");

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        cells.forEach((cell, index) => {
            cell.setAttribute("data-label", headers[index].innerText);
        });
    });
});
