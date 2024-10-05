import express from "express";

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const options = { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return date.toLocaleString('en-US', options);
}
  
  
 
  export default formatDate;